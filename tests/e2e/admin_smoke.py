"""Browser smoke test of /admin against the mocked Supabase API (see public_smoke.py for prerequisites).
Run: python3 -I tests/e2e/admin_smoke.py [screenshot_dir]"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright  # noqa: E402
from mock_supabase import NOW, Mock  # noqa: E402

BASE = os.environ.get("BASE_URL", "http://localhost:4173")
SHOTS = sys.argv[1] if len(sys.argv) > 1 else "/tmp/zhq-shots"
os.makedirs(SHOTS, exist_ok=True)
failures = []

def check(name, cond, detail=""):
    print(("PASS" if cond else "FAIL"), name, detail if not cond else "")
    if not cond:
        failures.append(name)

def lead(i, status, **kw):
    base = {"id": f"l{i}", "inquiry_code": f"INQ-{1000 + i}", "full_name": f"Client {i}", "email": f"c{i}@example.com", "phone": "0300",
            "organization": "Some College", "project_type": "Management system", "description": "Needs a system.", "problem": "Paper chaos.",
            "features": "Attendance", "budget": "Medium project", "timeline": "1–3 months", "existing_website": None, "additional_info": None,
            "contact_method": "Email", "consent": True, "status": status, "priority": "Normal", "tags": [], "follow_up_date": None,
            "notes": [], "contact_history": [], "created_at": NOW}
    base.update(kw)
    return base

def new_page(browser, mock, width=1280, height=900, mobile=False):
    ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=mobile)
    ctx.add_init_script("try{sessionStorage.setItem('zhq-intro','1')}catch(e){}")  # the cinematic intro has its own test (intro_smoke.py)
    page = ctx.new_page()
    mock.attach(page)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    return page, errors

def sign_in(page):
    page.goto(BASE + "/admin")
    page.wait_for_selector("form.login")
    page.fill("input[type=email]", "admin@example.com")
    page.fill("input[type=password]", "correct horse")
    page.click("button:has-text('Sign in')")

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---- gate: unauthenticated and unauthorized ----
    mock = Mock(role="none")
    page, _ = new_page(browser, mock)
    page.goto(BASE + "/admin")
    page.wait_for_selector("form.login")
    check("unauthenticated visitor sees sign-in, not the dashboard", "Command center" not in page.inner_text("body"))
    sign_in(page)
    page.wait_for_selector("text=Access denied", timeout=8000)
    check("signed-in non-admin is denied", "Command center" not in page.inner_text("body") and page.locator(".sidebar").count() == 0)

    # ---- admin session ----
    mock = Mock(role="super_admin")
    mock.tables["project_inquiries"] = [lead(1, "New", priority="High"), lead(2, "Contacted"), lead(3, "Proposal", follow_up_date="2020-01-01")]
    mock.tables["messages"] = [{"id": "m1", "name": "Omar", "email": "o@example.com", "subject": "Hi", "message": "Hello there", "status": "Unread", "created_at": NOW}]
    page, errors = new_page(browser, mock)
    sign_in(page)
    page.wait_for_selector(".sidebar", timeout=8000)

    nav = page.locator(".sidebar nav a")
    labels = [t.strip() for t in nav.all_inner_texts()]
    for needle in ["Dashboard", "Projects", "Services", "Journey", "Leads", "Project Inquiries", "Appointments", "Messages", "Testimonials", "Blogs", "Media", "Settings"]:
        check(f"sidebar has {needle}", any(l.startswith(needle) for l in labels))

    # dashboard
    page.wait_for_selector(".stats")
    page.wait_for_timeout(600)
    body = page.inner_text(".admin-content")
    check("dashboard heading", "Command center" in body)
    check("dashboard shows real counts", page.locator(".stat-n").first.inner_text().strip() not in ("", "…"))
    check("traffic chart renders bars", page.locator("svg.bars rect").count() == 7)
    check("analytics totals shown", "120" in body)
    check("recent activity shows notification", "INQ-1001" in body)
    check("sidebar badge counts new inquiries", page.locator(".sidebar a:has-text('Project Inquiries') .count").inner_text() == "1")
    page.screenshot(path=f"{SHOTS}/admin-dashboard.png", full_page=True)

    # projects CMS
    page.click(".sidebar a:has-text('Projects')")
    page.wait_for_selector(".atable")
    check("projects table lists DB rows", page.locator(".atable tbody tr").count() == 4)
    row = page.locator(".atable tbody tr").first
    row.locator("button[aria-label='Published']").click()
    page.wait_for_timeout(500)
    patches = [c for c in mock.calls if c[0] == "PATCH" and c[1].endswith("/projects")]
    check("publish toggle sends PATCH {published:false}", patches and patches[-1][2].get("published") is False, str(patches[-1:] if patches else ""))
    prev = page.locator(".atable tbody tr").first.locator("a.abtn")
    check("unpublished project row offers a Preview link", prev.inner_text().strip() == "Preview" and "?preview=1" in prev.get_attribute("href"))
    page.locator(".atable tbody tr").first.locator("button:has-text('Edit')").click()
    page.wait_for_selector(".drawer")
    check("editor drawer opens with case-study fields", "The problem" in page.inner_text(".drawer") or "Case study" in page.inner_text(".drawer"))
    name = page.locator("#f-name")
    name.fill("Aspire CR Connect v2")
    page.click(".drawer button:has-text('+ Add section')")
    page.fill("[aria-label='Section 1 title']", "Community impact")
    page.fill("[aria-label='Section 1 text']", "Used daily by students.")
    page.click(".drawer button:has-text('+ Add section')")  # left empty -> must be dropped on save
    page.click(".drawer button:has-text('Save')")
    page.wait_for_selector(".toast")
    saved = [c for c in mock.calls if c[0] == "PATCH" and c[1].endswith("/projects") and isinstance(c[2], dict) and c[2].get("name")]
    check("saving the editor PATCHes the new name and a safe slug", saved and saved[-1][2]["name"] == "Aspire CR Connect v2" and saved[-1][2]["slug"] == "aspire-cr-connect")
    check("custom sections saved; empty ones dropped",
          saved[-1][2].get("sections") == [{"title": "Community impact", "body": "Used daily by students."}])
    page.screenshot(path=f"{SHOTS}/admin-projects.png")

    # create a new project: slug auto-generated from the name
    page.wait_for_timeout(400)
    page.click("button:has-text('+ New project')")
    page.wait_for_selector(".drawer")
    page.locator("#f-name").fill("Brand New Thing!")
    page.click(".drawer button:has-text('Save')")
    page.wait_for_selector(".toast")
    created = [c for c in mock.calls if c[0] == "POST" and c[1].endswith("/projects")]
    check("new project gets a generated safe slug", created and created[-1][2]["slug"] == "brand-new-thing")

    # leads CRM
    page.click(".sidebar a:has-text('Leads')")
    page.wait_for_selector(".board")
    check("leads board has stage columns", page.locator(".col").count() >= 6)
    check("lead cards rendered", page.locator(".lcard").count() == 3)
    check("overdue follow-up flagged amber", page.locator(".lcard .badge.amber").count() == 1)
    page.locator(".lcard").first.locator("select").select_option("Discussion")
    page.wait_for_timeout(500)
    moved = [c for c in mock.calls if c[0] == "PATCH" and c[1].endswith("/project_inquiries")]
    check("changing stage PATCHes status", moved and moved[-1][2].get("status") == "Discussion")
    page.locator(".lcard").first.click()
    page.wait_for_selector(".drawer")
    d = page.inner_text(".drawer")
    check("lead drawer shows contact + inquiry", "c1@example.com" in d or "c2@example.com" in d or "c3@example.com" in d)
    page.fill(".drawer textarea", "Called and left voicemail")
    page.click(".drawer button:has-text('Add')")
    page.wait_for_timeout(500)
    notes = [c for c in mock.calls if c[0] == "PATCH" and isinstance(c[2], dict) and "notes" in c[2]]
    check("private note saved", notes and notes[-1][2]["notes"][0]["text"] == "Called and left voicemail")
    page.screenshot(path=f"{SHOTS}/admin-leads.png")
    page.click(".drawer .x")

    # inquiries inbox search
    page.click(".sidebar a:has-text('Project Inquiries')")
    page.wait_for_selector(".atable")
    page.fill("input[type=search]", "INQ-1002")
    page.wait_for_timeout(200)
    check("inquiry search filters rows", page.locator(".atable tbody tr").count() == 1)

    # messages
    page.click(".sidebar a:has-text('Messages')")
    page.wait_for_selector(".atable")
    page.click(".atable .linkish")
    page.wait_for_selector(".drawer")
    check("opening an unread message marks it read", any(c[0] == "PATCH" and c[1].endswith("/messages") and c[2].get("status") == "Read" for c in mock.calls))
    page.click(".drawer .x")

    # appointments, testimonials, insights, journey, services, media, settings all render
    for item, expect in [("Appointments", "Blocked dates"), ("Testimonials", "Testimonials"), ("Blogs", "Blogs"),
                         ("Journey", "Journey"), ("Services", "Services"), ("Media", "Media"), ("Settings", "Settings")]:
        page.click(f".sidebar a:has-text('{item}')")
        page.wait_for_timeout(500)
        check(f"{item} screen renders", expect.lower() in page.inner_text(".admin-content").lower())
    page.click(".achip:has-text('Booking')")
    check("booking settings show timezone and days", "Timezone" in page.inner_text(".admin-content") and "Available days" in page.inner_text(".admin-content"))
    page.screenshot(path=f"{SHOTS}/admin-settings.png", full_page=True)
    page.click(".achip:has-text('SEO')")
    check("SEO tab shows SERP preview, verification and per-page overrides", ".serp" and page.locator(".serp").count() == 1 and page.locator(".seo-page").count() >= 5 and "Bing" in page.inner_text(".admin-content"))
    page.click(".achip:has-text('Email alerts')")
    check("Email alerts tab explains Resend setup and has both switches", "RESEND_API_KEY" in page.inner_text(".admin-content") and "confirmation" in page.inner_text(".admin-content"))
    page.click(".achip:has-text('Site & brand')")
    page.fill("textarea[class*=mono]", "YouTube | https://youtube.com/@zeeshan\nBad | javascript:alert(1)")
    page.click("button:has-text('Save')")
    page.wait_for_timeout(500)
    ups = [c for c in mock.calls if c[0] == "POST" and c[1].endswith("/site_settings")]
    check("extra social profiles are saved", ups and "YouTube" in str(ups[-1][2]))
    check("settings save sends an upsert", any(c[0] == "POST" and c[1].endswith("/site_settings") for c in mock.calls))

    # sign out returns to sign-in
    page.click(".side-foot button:has-text('Sign out')")
    page.wait_for_selector("form.login", timeout=8000)
    check("sign out returns to sign-in", True)
    check("no console errors in admin", not errors, "; ".join(errors[:3]))

    # ---- mobile admin ----
    mock2 = Mock(role="super_admin")
    mpage, merrors = new_page(browser, mock2, 390, 844, mobile=True)
    sign_in(mpage)
    mpage.wait_for_selector(".admin")
    mpage.wait_for_timeout(500)
    check("mobile: sidebar hidden until opened", mpage.evaluate("document.querySelector('.sidebar').getBoundingClientRect().right <= 0"))
    mpage.click(".menu")
    mpage.wait_for_timeout(400)
    check("mobile: menu opens", mpage.evaluate("document.querySelector('.sidebar').getBoundingClientRect().left >= 0"))
    mpage.click(".sidebar a:has-text('Projects')")
    mpage.wait_for_selector(".atable")
    check("mobile: no horizontal page scroll in admin", not mpage.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    mpage.screenshot(path=f"{SHOTS}/admin-mobile.png")

    browser.close()

print("\nFAILURES:" if failures else "\nALL PASSED", failures if failures else "")
sys.exit(1 if failures else 0)
