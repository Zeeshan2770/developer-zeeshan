"""Browser test of the cinematic entrance against the built site (mocked Supabase).
Prereq: same as public_smoke.py (build with VITE_SUPABASE_URL=https://mock.supabase.co, serve on :4173).
Run: python3 -I tests/e2e/intro_smoke.py [screenshot_dir]"""
import os
import sys

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


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])

    def open_page(width=1440, height=900, mobile=False, reduced=False, prep=None):
        ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=mobile, has_touch=mobile,
                                  reduced_motion="reduce" if reduced else "no-preference")
        page = ctx.new_page()
        Mock().attach(page)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        if prep:
            prep(ctx, page)
        return ctx, page, errors

    def gone(page, timeout=12000):
        page.wait_for_selector(".cine", state="detached", timeout=timeout)

    # ---- 1. full run with the video present: plays, shows the name, real progress, ends by itself, hands over to the homepage ----
    ctx, page, errors = open_page()
    page.goto(BASE + "/")
    page.wait_for_selector(".cine")
    check("intro overlay appears on the first visit to /", page.locator(".cine").count() == 1)
    check("skip control is focused for keyboard users", page.evaluate("document.activeElement && document.activeElement.classList.contains('cine-skip')"))
    check("page scroll is locked while the intro is up", page.evaluate("getComputedStyle(document.documentElement).overflow") == "hidden")
    page.wait_for_function("document.querySelector('.cine-video') && document.querySelector('.cine-video').currentTime > 0.5", timeout=8000)
    check("the video really plays", page.evaluate("!document.querySelector('.cine-video').paused"))
    page.wait_for_selector(".cine.shown")
    page.wait_for_timeout(1300)
    page.screenshot(path=f"{SHOTS}/intro-desktop-1.png")
    check("name is shown as two lines", page.inner_text(".cine-l1") == "MUHAMMAD" and page.inner_text(".cine-l2") == "ZEESHAN HAIDER")
    check("tagline is shown", "BUILDING. LEADING. CREATING." in page.inner_text(".cine-tag").upper())
    pct = page.evaluate("document.querySelector('.cine-pct').textContent")
    check("loading shows a real percentage once the video length is known", pct.endswith("%") and pct != "0%" or pct == "100%", pct)
    page.wait_for_timeout(2200)
    page.screenshot(path=f"{SHOTS}/intro-desktop-2.png")
    check("hero text is held back while the intro plays", page.evaluate("getComputedStyle(document.querySelector('.hero-in, .w')).animationPlayState") == "paused")
    gone(page)
    check("intro ends by itself and is removed from the page", page.locator(".cine").count() == 0)
    check("scroll is unlocked afterwards", page.evaluate("getComputedStyle(document.documentElement).overflow") != "hidden")
    check("pre-paint guard class is cleared", not page.evaluate("document.documentElement.classList.contains('intro-pending')"))
    check("homepage heading is there and usable", page.locator("h1").count() == 1 and page.locator("h1").is_visible())
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{SHOTS}/intro-desktop-3-home.png")
    check("hero animation ran after the intro", page.evaluate("getComputedStyle(document.querySelector('.hero-in')).opacity") == "1")
    # internal navigation and a refresh must not replay it
    page.click("a[href='/projects']"); page.wait_for_selector("h1")
    page.click("a.brand"); page.wait_for_selector("h1")
    check("navigating back home does not replay the intro", page.locator(".cine").count() == 0)
    page.reload(); page.wait_for_selector("h1"); page.wait_for_timeout(500)
    check("reloading in the same session does not replay it", page.locator(".cine").count() == 0)
    check("no console errors during a full intro", not errors, "; ".join(errors[:3]))
    ctx.close()

    # ---- 2. Skip button and Escape ----
    ctx, page, errors = open_page()
    page.goto(BASE + "/"); page.wait_for_selector(".cine")
    page.wait_for_timeout(700)
    page.click(".cine-skip")
    gone(page, 4000)
    check("Skip intro removes the overlay quickly", page.locator(".cine").count() == 0)
    ctx.close()
    ctx, page, errors = open_page()
    page.goto(BASE + "/"); page.wait_for_selector(".cine")
    page.keyboard.press("Escape")
    gone(page, 4000)
    check("Escape also skips", page.locator(".cine").count() == 0)
    ctx.close()

    # ---- 3. Skipping early stops the video download ----
    ctx, page, errors = open_page()
    page.goto(BASE + "/"); page.wait_for_selector(".cine-video")
    page.keyboard.press("Enter")   # Enter on the focused Skip button
    gone(page, 4000)
    check("keyboard Enter on the focused Skip button works", page.locator(".cine").count() == 0)
    ctx.close()

    # ---- 4. Video files missing (404): polished still portrait, no broken media, ends by itself ----
    def block_video(ctx, page):
        page.route("**/media/zeeshan-entrance*", lambda r: r.fulfill(status=404, body="no"))
    ctx, page, errors = open_page(prep=block_video)
    page.goto(BASE + "/"); page.wait_for_selector(".cine")
    page.wait_for_selector(".cine.is-still", timeout=9000)
    check("missing video falls back to the still portrait", page.locator(".cine-still").count() == 1 and page.locator(".cine-video").count() == 0)
    page.wait_for_timeout(900)
    check("still portrait image actually loaded", page.evaluate("document.querySelector('.cine-still').naturalWidth") > 100)
    check("name is shown over the still portrait", page.locator(".cine.shown").count() == 1)
    page.screenshot(path=f"{SHOTS}/intro-still-desktop.png")
    gone(page, 9000)
    check("homepage opens after the still intro", page.locator("h1").is_visible())
    ctx.close()

    # ---- 5. Autoplay refused: still portrait, intro still completes ----
    def refuse_play(ctx, page):
        page.add_init_script("HTMLMediaElement.prototype.play = function(){ return Promise.reject(new DOMException('blocked','NotAllowedError')); }")
    ctx, page, errors = open_page(prep=refuse_play)
    page.goto(BASE + "/"); page.wait_for_selector(".cine")
    page.wait_for_selector(".cine.is-still", timeout=6000)
    check("refused autoplay falls back to the still portrait", page.locator(".cine-still").count() == 1)
    gone(page, 9000)
    check("homepage opens after refused autoplay", page.locator("h1").is_visible())
    ctx.close()

    # ---- 6. Very slow video: the hard ceiling still opens the site ----
    def stall_video(ctx, page):
        page.route("**/media/zeeshan-entrance*", lambda r: None)   # never answered; the request just hangs
    ctx, page, errors = open_page(prep=stall_video)
    page.goto(BASE + "/"); page.wait_for_selector(".cine")
    check("loading bar is indeterminate while nothing is known (no fake percentage)", page.locator(".cine-bar.indet").count() == 1 and page.evaluate("getComputedStyle(document.querySelector('.cine-pct')).visibility") == "hidden")
    gone(page, 12000)
    check("a stalled video never blocks the site", page.locator("h1").is_visible())
    ctx.close()

    # ---- 7. Data saver: no video request at all ----
    def save_data(ctx, page):
        page.add_init_script("Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } });")
    ctx, page, errors = open_page(prep=save_data)
    asked = []
    page.on("request", lambda r: asked.append(r.url) if "zeeshan-entrance" in r.url else None)
    page.goto(BASE + "/"); page.wait_for_selector(".cine.is-still", timeout=5000)
    gone(page, 9000)
    check("data saver: the video is never requested", not asked, str(asked))
    ctx.close()

    # ---- 8. Reduced motion and deep links: no intro ----
    ctx, page, errors = open_page(reduced=True)
    page.goto(BASE + "/"); page.wait_for_selector("h1"); page.wait_for_timeout(400)
    check("reduced motion: no intro at all", page.locator(".cine").count() == 0)
    check("reduced motion: page is not hidden by the pre-paint guard", page.evaluate("getComputedStyle(document.querySelector('#root')).visibility") == "visible")
    ctx.close()
    ctx, page, errors = open_page()
    page.goto(BASE + "/blog/building-cr-connect"); page.wait_for_selector("h1"); page.wait_for_timeout(400)
    check("deep link to an article goes straight to the article", page.locator(".cine").count() == 0)
    ctx.close()

    # ---- 9. Mobile phone and tablet portrait ----
    for label, w, h, mobile in [("phone", 390, 844, True), ("tablet", 820, 1180, True)]:
        ctx, page, errors = open_page(w, h, mobile=mobile)
        page.goto(BASE + "/"); page.wait_for_selector(".cine")
        check(f"{label}: portrait layout is used", page.locator(".cine.is-portrait").count() == 1)
        page.wait_for_function("document.querySelector('.cine-video') && document.querySelector('.cine-video').currentTime > 0.3", timeout=8000)
        src = page.evaluate("document.querySelector('.cine-video').currentSrc")
        check(f"{label}: the lighter mobile video is used", "-mobile" in src, src)
        page.wait_for_timeout(2600)
        page.screenshot(path=f"{SHOTS}/intro-{label}.png")
        check(f"{label}: no sideways scroll", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
        box = page.locator(".cine-skip").bounding_box()
        check(f"{label}: skip control is on screen and at least 44px tall", box and box["y"] >= 0 and box["x"] + box["width"] <= w and box["height"] >= 44, str(box))
        for sel in [".cine-name", ".cine-load"]:
            b = page.locator(sel).bounding_box()
            check(f"{label}: {sel} fits the screen", b and b["x"] >= 0 and b["x"] + b["width"] <= w + 1 and b["y"] + b["height"] <= h, str(b))
        gone(page, 12000)
        check(f"{label}: opens the homepage", page.locator("h1").is_visible())
        check(f"{label}: no console errors", not errors, "; ".join(errors[:3]))
        ctx.close()

    # ---- 10. Light theme must not change the (always dark) intro ----
    def light(ctx, page):
        page.add_init_script("localStorage.setItem('zhq-theme','light')")
    ctx, page, errors = open_page(prep=light)
    page.goto(BASE + "/"); page.wait_for_selector(".cine")
    check("intro stays near-black in the light theme", page.evaluate("getComputedStyle(document.querySelector('.cine')).backgroundColor") == "rgb(5, 5, 5)")
    page.click(".cine-skip"); gone(page, 4000)
    ctx.close()

    browser.close()

print()
print("ALL PASSED" if not failures else f"FAILURES: {failures}")
sys.exit(1 if failures else 0)
