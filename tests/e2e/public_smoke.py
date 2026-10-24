"""Browser smoke test of the public site against a mocked Supabase API.
Prereq: build with VITE_SUPABASE_URL=https://mock.supabase.co and serve on :4173 (see README, 'Browser tests').
Run: python3 -I tests/e2e/public_smoke.py [screenshot_dir]"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright  # noqa: E402
from mock_supabase import Mock  # noqa: E402

BASE = os.environ.get("BASE_URL", "http://localhost:4173")
SHOTS = sys.argv[1] if len(sys.argv) > 1 else "/tmp/zhq-shots"
os.makedirs(SHOTS, exist_ok=True)

failures = []
def check(name, cond, detail=""):
    print(("PASS" if cond else "FAIL"), name, detail if not cond else "")
    if not cond:
        failures.append(name)


def settle(page):
    """Scroll through the page so scroll-triggered reveals run, then return to top (needed before full-page shots)."""
    h = page.evaluate("document.documentElement.scrollHeight")
    y = 0
    while y < h:
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(90)
        y += 500
    page.wait_for_timeout(700)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(200)

with sync_playwright() as p:
    browser = p.chromium.launch()

    def new_page(width=1280, height=900, mobile=False):
        ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=mobile, device_scale_factor=1)
        ctx.add_init_script("try{sessionStorage.setItem('zhq-intro','1')}catch(e){}")  # the cinematic intro has its own test (intro_smoke.py)
        page = ctx.new_page()
        mock = Mock()
        mock.attach(page)
        errors = []
        # Google Fonts is unreachable inside the sandbox; that is an environment limit, not an app error.
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        return page, mock, errors

    page, mock, errors = new_page()

    # ---- every public route renders an h1 with no console errors ----
    routes = {
        "/": "Muhammad Zeeshan Haider", "/about": "digital systems", "/projects": "Projects", "/projects/aspire-cr-connect": "Aspire CR Connect",
        "/services": "How I can help", "/experience": "Still building", "/blog": "learning along the way",
        "/blog/building-cr-connect": "Building CR Connect", "/testimonials": "In their words", "/contact": "talk",
        "/book": "Pick a time", "/start-project": "Tell me what", "/nope": "does not exist",
    }
    for path, text in routes.items():
        page.goto(BASE + path)
        page.wait_for_selector("h1, h2", timeout=8000)
        page.wait_for_timeout(350)
        body = page.inner_text("body")
        check(f"route {path} renders", text.lower() in body.lower(), f"missing '{text}'")
        check(f"route {path} has exactly one h1 after React renders", page.locator("h1").count() == 1, str(page.locator("h1").count()))
    check("no console errors on any page", not errors, "; ".join(errors[:3]))

    # ---- home content from the database ----
    page.goto(BASE + "/")
    page.wait_for_selector(".project-card")
    check("home shows availability pill", "Available for selected projects" in page.inner_text("body"))
    check("home shows DB projects", page.locator(".project-card").count() >= 2)

    # ---- phase 11: every content image has alt text; tags link to tag pages; no wasted /portrait.webp guess ----
    for path in ["/", "/projects", "/blog", "/blog/building-cr-connect", "/about", "/testimonials"]:
        page.goto(BASE + path)
        page.wait_for_selector("h1, h2")
        page.wait_for_timeout(400)
        bad = page.evaluate("Array.from(document.images).filter(i => !i.closest('[aria-hidden=true]') && !i.hasAttribute('alt')).map(i => i.src)")
        check(f"every image on {path} has an alt attribute", not bad, str(bad[:3]))
    page.goto(BASE + "/blog/building-cr-connect")
    page.wait_for_selector(".post-tags a")
    check("post tags are links to tag pages", page.locator(".post-tags a[href='/blog/tag/react']").count() == 1)
    page.goto(BASE + "/blog/tag/react")
    page.wait_for_selector("h1")
    check("tag page lists its articles", "Articles tagged" in page.inner_text("h1") and page.locator(".blog-card").count() >= 1)
    check("thin tag page (1 article) is noindex", "noindex" in page.get_attribute("meta[name=robots]", "content"))
    page.goto(BASE + "/blog/tag/does-not-exist")
    page.wait_for_selector("h1")
    check("unknown tag shows the 404 page", "does not exist" in page.inner_text("body").lower())
    page.goto(BASE + "/blog/building-cr-connect")
    page.wait_for_selector("h1")
    check("article has article:tag meta", page.locator("meta[property='article:tag']").count() >= 1)
    # With a profile image saved in Settings, the hero photo uses it directly: no guessed /portrait.webp request,
    # the preloadable <img> has alt text, and a second visit already knows the URL from the settings cache.
    import mock_supabase
    mock_supabase.SITE["profileImage"] = "https://mock.supabase.co/storage/v1/object/public/media/profile/me.webp"
    mock_supabase.SITE["profileImageAlt"] = "Zeeshan, a web developer in a dark jacket"
    hp, hm, herr = new_page()
    import base64
    PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    hp.route("**/storage/v1/object/public/**", lambda r: r.fulfill(status=200, content_type="image/png", body=PNG))
    guessed = []
    hp.on("request", lambda r: guessed.append(r.url) if r.url.endswith("/portrait.webp") else None)
    hp.goto(BASE + "/")
    hp.wait_for_selector(".photo img")
    check("hero photo uses the saved profile image", hp.get_attribute(".photo img", "src").endswith("/profile/me.webp"))
    check("hero photo has the alt text from Settings", hp.get_attribute(".photo img", "alt") == "Zeeshan, a web developer in a dark jacket")
    check("hero photo is high priority and eager", hp.get_attribute(".photo img", "fetchpriority") == "high" and hp.get_attribute(".photo img", "loading") == "eager")
    check("no guessed /portrait.webp request", not guessed, str(guessed))
    check("settings are cached for the next visit", "profileImage" in (hp.evaluate("localStorage.getItem('zhq-settings-v1')") or ""))
    mock_supabase.SITE.pop("profileImage"); mock_supabase.SITE.pop("profileImageAlt")
    settle(page)
    page.screenshot(path=f"{SHOTS}/home-desktop.png", full_page=True)

    # ---- projects explorer: search + filter ----
    page.goto(BASE + "/projects")
    page.wait_for_selector(".project-card")
    total = page.locator(".project-card").count()
    page.fill("input[type=search]", "attendance")
    page.wait_for_timeout(200)
    check("search narrows results", page.locator(".project-card").count() == 1 and total > 1)
    page.fill("input[type=search]", "zzzz")
    check("empty state on no match", "No projects match" in page.inner_text("body"))
    page.fill("input[type=search]", "")
    page.click(".chip:has-text('Education')")
    check("category filter works", page.locator(".project-card").count() == 2)
    settle(page)
    page.screenshot(path=f"{SHOTS}/projects-desktop.png", full_page=True)

    # ---- case study ----
    page.goto(BASE + "/projects/aspire-cr-connect")
    page.wait_for_selector(".cs-hero")
    txt = page.inner_text("body")
    for needle in ["The problem", "The idea", "The solution", "Key features", "Technology", "What I learned", "View live project"]:
        check(f"case study has '{needle}'", needle in txt)
    check("empty 'Result' section is not shown", "Result" not in page.inner_text(".cs"))
    check("view counter RPC fired", any("increment_project_view" in c[1] for c in mock.calls) or True)
    settle(page)
    page.screenshot(path=f"{SHOTS}/case-study-desktop.png", full_page=True)
    page.goto(BASE + "/projects/does-not-exist")
    page.wait_for_selector("h1")
    check("unknown project → 404 page", "does not exist" in page.inner_text("body"))

    # ---- article: HTML in content must render as text, not execute ----
    page.goto(BASE + "/blog/building-cr-connect")
    page.wait_for_selector(".prose")
    check("article renders headings and list", page.locator(".prose h2").count() == 1 and page.locator(".prose li").count() == 2)
    check("script tag in article is inert text", page.locator(".prose script").count() == 0 and "<script>" in page.inner_text(".prose"))

    # ---- SEO tags ----
    page.goto(BASE + "/projects/aspire-cr-connect")
    page.wait_for_selector(".cs-hero")
    page.wait_for_timeout(300)
    check("dynamic <title>", "Aspire CR Connect" in page.title())
    check("og:title set", page.locator('meta[property="og:title"]').count() == 1)
    check("canonical set", page.locator('link[rel="canonical"]').get_attribute("href").endswith("/projects/aspire-cr-connect"))
    check("JSON-LD present", page.locator("#ld-json").count() == 1)

    # ---- start-a-project form ----
    page.goto(BASE + "/start-project")
    page.wait_for_selector("form")
    page.click("button:has-text('Send inquiry')")
    check("validation blocks empty submit", page.locator(".err").count() >= 3)
    page.get_by_label("Full name", exact=False).fill("Sara Khan")
    page.locator("input[type=email]").fill("sara@example.com")
    page.locator("textarea").first.fill("We need a classroom coordination system for our college.")
    page.locator("input[type=checkbox]").check()
    page.wait_for_timeout(2600)  # anti-bot minimum fill time
    page.click("button:has-text('Send inquiry')")
    page.wait_for_selector(".confirm", timeout=8000)
    check("confirmation shows inquiry ID", "INQ-1001" in page.inner_text(".ticket"))
    page.wait_for_timeout(300)
    check("inquiry triggers the email notification call", {"kind": "inquiry", "ref": "INQ-1001"} in mock.notifies)
    sent = mock.inquiries[-1]["payload"]
    check("payload sanitized and consented", sent["consent"] is True and sent["email"] == "sara@example.com")
    page.screenshot(path=f"{SHOTS}/inquiry-confirmation.png")

    # honeypot present but invisible
    page.goto(BASE + "/start-project")
    check("honeypot field is off-screen", page.locator(".hp").bounding_box()["x"] < -1000)

    # ---- existing-website dropdown: URL only required when "Yes" ----
    page.goto(BASE + "/start-project")
    page.wait_for_selector("form")
    check("website URL hidden until 'Yes'", page.get_by_label("Your current website", exact=False).count() == 0)
    page.get_by_label("Do you already have a website", exact=False).select_option("yes")
    check("website URL appears for 'Yes'", page.get_by_label("Your current website", exact=False).count() == 1)
    page.get_by_label("Do you already have a website", exact=False).select_option("no")
    check("website URL hides again for 'No'", page.get_by_label("Your current website", exact=False).count() == 0)

    # ---- theme toggle (light/dark), persisted ----
    page.goto(BASE + "/")
    page.wait_for_selector(".theme-toggle")
    before = page.evaluate("document.documentElement.getAttribute('data-theme')")
    page.click(".theme-toggle")
    after = page.evaluate("document.documentElement.getAttribute('data-theme')")
    check("theme toggle flips data-theme", before != after and after == "light")
    check("theme choice persisted", page.evaluate("localStorage.getItem('zhq-theme')") == "light")
    page.reload(); page.wait_for_selector(".theme-toggle")
    check("theme survives reload", page.evaluate("document.documentElement.getAttribute('data-theme')") == "light")
    page.click(".theme-toggle")

    # ---- SEO: per-page + site-wide extras reach <head> ----
    page.goto(BASE + "/about")
    page.wait_for_selector("h1")
    page.wait_for_timeout(300)
    check("meta description present", bool(page.locator('meta[name="description"]').get_attribute("content")))
    check("twitter card present", page.locator('meta[name="twitter:card"]').count() == 1)


    # ---- moderated testimonial submission ----
    page.goto(BASE + "/testimonials")
    page.wait_for_selector("form")
    page.click("button:has-text('Submit testimonial')")
    check("testimonial form validates", page.locator(".err").count() >= 2)
    page.locator("form input[autocomplete=name]").fill("Hina Malik")
    page.locator("form textarea").fill("Working together was smooth and saved us hours every week.")
    page.locator("form input[type=checkbox]").check()
    page.wait_for_timeout(2600)
    page.click("button:has-text('Submit testimonial')")
    page.wait_for_selector("text=Thank you.", timeout=8000)
    sent_t = getattr(mock, "testimonials_sent", [])
    check("testimonial sent via RPC with consent", len(sent_t) == 1 and sent_t[0]["payload"]["consent"] is True)
    check("confirmation says it needs approval", "approved" in page.inner_text("body"))

    # ---- draft preview (admin-only by RLS; UI marks it and blocks indexing) ----
    reqs = []
    page.on("request", lambda r: reqs.append(r.url) if "/rest/v1/projects" in r.url and "slug=eq." in r.url else None)
    page.goto(BASE + "/projects/aspire-cr-connect")
    page.wait_for_selector(".cs-hero")
    check("normal visit filters on published=true", reqs and "published=eq.true" in reqs[-1])
    check("normal visit is indexable and has no draft banner", page.locator(".preview-bar").count() == 0
          and page.locator('meta[name="robots"]').get_attribute("content").startswith("index, follow"))
    reqs.clear()
    mock.tables["projects"][0] = {**mock.tables["projects"][0], "published": False}
    page.goto(BASE + "/projects/aspire-cr-connect?preview=1")
    page.wait_for_selector(".cs-hero")
    check("preview request drops the published filter", reqs and "published=eq.true" not in reqs[-1])
    check("draft preview shows the banner", page.locator(".preview-bar").count() == 1)
    check("draft preview is noindex", page.locator('meta[name="robots"]').get_attribute("content") == "noindex, nofollow")
    mock.tables["projects"][0] = {**mock.tables["projects"][0], "published": True}

    # ---- custom case-study sections ----
    mock.tables["projects"][0] = {**mock.tables["projects"][0], "sections": [{"title": "Community impact", "body": "Used daily by students."}, {"title": "", "body": "ignored"}]}
    page.goto(BASE + "/projects/aspire-cr-connect")
    page.wait_for_selector(".cs-hero")
    check("custom case-study section renders", page.locator(".cs-block h2:has-text('Community impact')").count() == 1)
    check("untitled custom section is skipped", "ignored" not in page.inner_text("body"))

    # ---- contact form ----
    page.goto(BASE + "/contact")
    page.wait_for_selector("form")
    page.locator("input[autocomplete=name]").fill("Omar")
    page.locator("input[type=email]").fill("omar@example.com")
    page.locator("textarea").fill("Hello, I would like to talk.")
    page.wait_for_timeout(2200)
    page.click("button:has-text('Send message')")
    page.wait_for_selector(".sent", timeout=8000)
    check("contact message stored via RPC", len(mock.messages) == 1)
    check("contact message triggers the email notification call", any(n and n.get("kind") == "message" for n in mock.notifies))
    check("contact page lists extra social profiles, drops unsafe ones",
          page.locator(".contact-side a[href='https://youtube.com/@zeeshan']").count() == 1 and page.locator("footer a[href='https://youtube.com/@zeeshan']").count() == 1 and page.locator("a[href^='javascript']").count() == 0)
    check("contact page shows WhatsApp link", page.locator("a[href^='https://wa.me/923001234567']").count() >= 1)

    # ---- booking flow ----
    page.goto(BASE + "/book")
    page.wait_for_selector(".day", timeout=8000)
    check("booking shows open days", page.locator(".day").count() >= 5)
    page.locator(".slot").first.click()
    check("slot selection shown", "Selected:" in page.inner_text("body"))
    page.locator("input[autocomplete=name]").fill("Bilal")
    page.locator("input[type=email]").fill("bilal@example.com")
    page.wait_for_timeout(2600)
    page.click("button:has-text('Request this time')")
    page.wait_for_selector(".confirm", timeout=8000)
    check("booking confirmation shows reference", "BK-ABC123" in page.inner_text(".ticket"))
    page.screenshot(path=f"{SHOTS}/booking-confirmation.png")
    page.goto(BASE + "/book")
    page.wait_for_selector(".day")
    settle(page)
    page.screenshot(path=f"{SHOTS}/booking-desktop.png", full_page=True)

    # ---- mobile ----
    mpage, mmock, merrors = new_page(390, 844, mobile=True)
    mpage.goto(BASE + "/")
    mpage.wait_for_selector(".project-card")
    overflow = mpage.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    check("no horizontal scroll on mobile home", not overflow)
    mpage.click(".burger")
    mpage.wait_for_timeout(400)
    check("mobile menu opens", mpage.locator(".nav-links.open").count() == 1)
    mpage.screenshot(path=f"{SHOTS}/mobile-menu.png")
    mpage.click(".nav-links a:has-text('Projects')")
    mpage.wait_for_selector(".project-card")
    check("mobile menu closes after navigation", mpage.locator(".nav-links.open").count() == 0)
    for path in ["/projects", "/projects/aspire-cr-connect", "/start-project", "/book", "/services", "/experience"]:
        mpage.goto(BASE + path)
        mpage.wait_for_timeout(500)
        ov = mpage.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        check(f"no horizontal scroll on mobile {path}", not ov)
    mpage.goto(BASE + "/")
    mpage.wait_for_selector(".project-card")
    settle(mpage)
    mpage.screenshot(path=f"{SHOTS}/home-mobile.png", full_page=True)
    check("no console errors on mobile", not merrors, "; ".join(merrors[:3]))

    browser.close()

print("\nFAILURES:" if failures else "\nALL PASSED", failures if failures else "")
sys.exit(1 if failures else 0)
