"""In-memory fake of the Supabase REST/auth API, wired into Playwright via page routing.
Lets the real built frontend run in a real browser with no Supabase project. Test-only."""
import json
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
    "access-control-expose-headers": "content-range",
}

NOW = datetime.now(timezone.utc).isoformat()

SITE = {
    "name": "Muhammad Zeeshan Haider", "title": "Programmer • Developer • Builder", "tagline": "Build. Solve. Evolve.",
    "heroStatement": "I build digital systems that turn ideas into working solutions.",
    "heroSupport": "Websites, full-stack applications, educational platforms, management systems and custom digital solutions.",
    "availability": {"open": True, "label": "Available for selected projects"},
    "email": "hello@example.com", "phone": "", "whatsapp": "923001234567",
    "social": {"github": "https://github.com/example", "linkedin": "", "extra": [{"label": "YouTube", "url": "https://youtube.com/@zeeshan"}, {"label": "Bad", "url": "javascript:alert(1)"}]},
    "timezone": "Asia/Karachi", "seo": {"defaultDescription": "Default description", "ogImage": ""},
    "footer": "Build. Solve. Evolve.", "copyright": "Muhammad Zeeshan Haider",
}

BOOKING = {
    "enabled": True, "timezone": "Asia/Karachi", "days": [1, 2, 3, 4, 5], "start": "10:00", "end": "17:00",
    "durationMin": 30, "bufferMin": 15, "maxPerDay": 4, "minNoticeHours": 12, "horizonDays": 30,
    "purposes": ["Discuss a project", "Technical consultation"], "types": ["Video call", "Phone call"],
}

def project(i, slug, name, cat, status, featured, desc, tech=None, **extra):
    base = {
        "id": f"p{i}", "slug": slug, "name": name, "short_description": desc, "category": cat, "status": status,
        "year": 2025, "thumbnail_url": None, "technologies": tech or {}, "featured": featured, "sort_order": i * 10,
        "live_url": None, "github_url": None, "published": True, "view_count": 0, "media": [],
    }
    base.update(extra)
    return base

PROJECTS = [
    project(1, "aspire-cr-connect", "Aspire CR Connect", "Management Systems", "Live", True,
            "Classroom coordination system for attendance, class representatives and concerns.",
            {"frontend": ["React", "Vite"], "database": ["Supabase", "PostgreSQL"], "hosting": ["Netlify"]},
            live_url="https://example.com", role="Designed and built the whole system.",
            problem="Attendance and concerns were scattered across paper and chat groups.\n\nNobody had one place to look.",
            idea="One lightweight system that class representatives could actually use.",
            solution="A role-based web app with attendance, concerns and reporting.",
            challenges="Keeping it simple for non-technical users.", process="Started as a prototype, then iterated with real users.",
            learned="Start with the workflow, not the framework.", result=None,
            project_features=[{"id": "f1", "title": "Attendance", "description": "Mark and review attendance.", "sort_order": 10},
                              {"id": "f2", "title": "Concerns", "description": "Raise and track concerns.", "sort_order": 20}]),
    project(2, "pip-study-hub", "PIP Study Hub", "Education", "In Progress", True, "A study-community web app.", {"frontend": ["HTML", "CSS", "JavaScript"]}),
    project(3, "cs-compass", "CS Compass", "Education", "In Progress", False, "Case study details to be added."),
    project(4, "mental-health-support-platform", "Mental Health Support Platform", "Digital Products", "Concept", False, "Case study details to be added."),
]

SERVICES = [
    {"id": f"s{i}", "slug": s, "title": t, "summary": f"{t} summary.", "what_it_is": "What it is.", "who_for": "Who it is for.",
     "includes": ["Item one", "Item two"], "workflow": ["Discover", "Build", "Launch"], "icon": ic, "cta_label": "Start a Project",
     "cta_url": "/start-project", "published": True, "sort_order": i * 10}
    for i, (s, t, ic) in enumerate([("website-development", "Website Development", "globe"), ("full-stack", "Full-Stack Applications", "layers"),
                                    ("education", "Educational Platforms", "book")], start=1)
]

JOURNEY = [{"id": f"j{i}", "title": t, "description": "Description.", "period": p, "category": "Milestone", "featured": i == 1, "published": True, "sort_order": i}
           for i, (t, p) in enumerate([("Early interest in technology", ""), ("First projects", "2023"), ("Current focus", "")], start=1)]

INSIGHTS = [{"id": "i1", "slug": "building-cr-connect", "title": "Building CR Connect", "excerpt": "What I learned.", "cover_url": None, "category": "Case study",
             "tags": ["react"], "published_at": NOW, "reading_minutes": 3, "featured": False, "published": True, "author": "Zeeshan",
             "content": "## Why\n\nIt started with a problem.\n\n- first\n- second\n\n<script>alert(1)</script>"}]


class Mock:
    def __init__(self, role="super_admin", signed_in_admin=False):
        self.calls = []          # (method, path, body)
        self.inquiries = []
        self.messages = []
        self.booked = []
        self.role = role
        self.notifies = []
        self.tables = {"projects": list(PROJECTS), "services": SERVICES, "journey_entries": JOURNEY, "insights": INSIGHTS,
                       "testimonials": [], "project_inquiries": [], "messages": [], "appointments": [], "blocked_dates": [],
                       "notifications": [{"id": "n1", "kind": "new_inquiry", "title": "New project inquiry INQ-1001 from Sara", "created_at": NOW}],
                       "media": [], "admin_activity": [], "project_features": []}

    def attach(self, page):
        page.route(re.compile(r"https://mock\.supabase\.co/.*"), self.handle)
        page.route(re.compile(r".*/\.netlify/functions/notify$"), self.handle_notify)

    def handle_notify(self, route, request):
        try:
            self.notifies.append(request.post_data_json)
        except Exception:
            self.notifies.append(None)
        route.fulfill(status=200, headers={"content-type": "application/json"}, body='{"ok":true,"skipped":"email_not_configured"}')

    def respond(self, route, status, body, extra=None):
        h = dict(CORS)
        h["content-type"] = "application/json"
        if extra:
            h.update(extra)
        route.fulfill(status=status, headers=h, body=json.dumps(body))

    def handle(self, route, request):
        if request.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        u = urlparse(request.url)
        q = parse_qs(u.query)
        body = None
        try:
            body = request.post_data_json
        except Exception:
            body = request.post_data
        self.calls.append((request.method, u.path, body))
        accept = request.headers.get("accept", "")
        single = "pgrst.object" in accept

        # ---- auth ----
        if u.path.startswith("/auth/v1/token"):
            return self.respond(route, 200, {
                "access_token": "tok", "token_type": "bearer", "expires_in": 3600, "refresh_token": "ref",
                "user": {"id": "admin-1", "email": "admin@example.com", "aud": "authenticated", "role": "authenticated"},
            })
        if u.path.startswith("/auth/v1/logout"):
            return route.fulfill(status=204, headers=CORS)
        if u.path.startswith("/auth/v1/user"):
            return self.respond(route, 200, {"id": "admin-1", "email": "admin@example.com", "aud": "authenticated"})

        # ---- rpc ----
        m = re.match(r"/rest/v1/rpc/(\w+)", u.path)
        if m:
            fn = m.group(1)
            if fn == "submit_project_inquiry":
                self.inquiries.append(body)
                return self.respond(route, 200, "INQ-1001")
            if fn == "submit_contact_message":
                self.messages.append(body)
                return route.fulfill(status=204, headers=CORS)
            if fn == "submit_testimonial":
                self.testimonials_sent = getattr(self, "testimonials_sent", []) + [body]
                return route.fulfill(status=204, headers=CORS)
            if fn == "get_booked_slots":
                return self.respond(route, 200, self.booked)
            if fn == "request_appointment":
                self.booked.append({"starts_at": body["payload"]["starts_at"], "ends_at": body["payload"]["starts_at"]})
                return self.respond(route, 200, "BK-ABC123")
            if fn == "admin_analytics":
                today = datetime.now(timezone.utc).date()
                return self.respond(route, 200, {
                    "totals": {"page_view": 120, "project_view": 40, "inquiry_submitted": 3, "contact_submitted": 2, "appointment_requested": 1},
                    "daily": [{"day": str(today - timedelta(days=i)), "views": 10 + i * 3} for i in range(6, -1, -1)],
                    "topPages": [{"path": "/", "views": 60}, {"path": "/projects", "views": 25}],
                })
            return route.fulfill(status=204, headers=CORS)

        # ---- tables ----
        m = re.match(r"/rest/v1/(\w+)", u.path)
        if m:
            t = m.group(1)
            if t == "analytics_events":
                return route.fulfill(status=201, headers=CORS)
            if t == "site_settings":
                key = (q.get("key") or [""])[0].replace("eq.", "")
                rows = []
                if "in." in (q.get("key") or [""])[0]:
                    rows = [{"key": "site", "value": SITE}, {"key": "booking", "value": BOOKING}]
                elif key == "site":
                    rows = [{"value": SITE}]
                elif key == "booking":
                    rows = [{"value": BOOKING}]
                if request.method in ("POST", "PATCH"):
                    return route.fulfill(status=201, headers=CORS)
                return self.respond(route, 200, rows[0] if single and rows else rows) if rows or not single else self.respond(route, 406, {"message": "none"})
            if t == "profiles":
                rows = [{"role": self.role}]
                return self.respond(route, 200, rows[0] if single else rows)
            rows = list(self.tables.get(t, []))
            slug = (q.get("slug") or [None])[0]
            if slug:
                rows = [r for r in rows if r.get("slug") == slug.replace("eq.", "")]
            if request.method == "HEAD" or "count=exact" in request.headers.get("prefer", ""):
                status_filter = (q.get("status") or [None])[0]
                if status_filter and status_filter.startswith("eq."):
                    rows = [r for r in rows if r.get("status") == status_filter[3:]]
                n = len(rows)
                return route.fulfill(status=200, headers={**CORS, "content-range": f"0-{max(n - 1, 0)}/{n}", "content-type": "application/json"}, body="" if request.method == "HEAD" else json.dumps(rows))
            if request.method in ("POST", "PATCH", "DELETE"):
                if request.method == "POST" and isinstance(body, dict):
                    body = {**body, "id": body.get("id") or f"new{len(self.tables.get(t, []))}"}
                    self.tables.setdefault(t, []).append(body)
                    return self.respond(route, 201, body if single else [body])
                if request.method == "PATCH" and isinstance(body, dict):
                    target = (q.get("id") or [""])[0].replace("eq.", "")
                    for r in self.tables.get(t, []):
                        if r.get("id") == target:
                            r.update(body)
                            return self.respond(route, 200, r if single else [r])
                if request.method == "DELETE":
                    target = (q.get("id") or [""])[0].replace("eq.", "")
                    self.tables[t] = [r for r in self.tables.get(t, []) if r.get("id") != target]
                    return route.fulfill(status=204, headers=CORS)
                return self.respond(route, 200, (rows[0] if single else rows[:1]) if rows else [])
            if single:
                return self.respond(route, 200, rows[0]) if rows else self.respond(route, 406, {"message": "The result contains 0 rows", "code": "PGRST116"})
            return self.respond(route, 200, rows)
        return route.fulfill(status=404, headers=CORS, body="{}")
