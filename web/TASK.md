# Task: Build NyaTicketTools Web Management Dashboard

## Overview
Build a beautiful, production-ready single-page web dashboard for managing Bilibili ticket-grabbing tools. This is a static HTML + CSS + JS app (no build tools needed) that will be served by a simple Python HTTP server.

## Design Requirements

### Visual Style
- **Theme**: Dark mode with glassmorphism effects
- **Color palette**: Deep purple (#7C3AED) as primary, dark backgrounds (#0F0B1A, #1A1333)
- **Typography**: Inter for UI, JetBrains Mono for code/data
- **Animations**: GSAP for all transitions, page load animations, hover effects
- **Icons**: Lucide SVG icons (inline, no emoji)
- **Responsive**: Works on 375px mobile through 1440px desktop

### Pages/Sections (Single Page App)
1. **Dashboard** - Overview of all tools, their status, and quick actions
2. **Accounts** - Manage Bilibili accounts (add/edit/delete, cookie management)
3. **Tickets** - Configure target ticket (project ID, screen, SKU, buyer info)
4. **Tools** - Status of each tool (biliTickerBuy, BHYG, bili_ticket_rush, bili-ticket-go)
5. **Deploy** - Multi-machine deployment status and sync

### Dashboard Cards (GSAP animated on load)
Each tool gets a card showing:
- Tool name + icon
- Status indicator (idle/running/success/failed)
- Last run time
- Quick start/stop button

### Account Management
- Add account form: name, UID, SESSDATA cookie, bili_jct, DedeUserID
- Cards for each account with status
- Cookie expiration warning

### Ticket Configuration
- Form with: project_id, screen_id, sku_id, pay_money, count
- Buyer info: name, phone, ID card
- Sale time picker
- Preview of the generated config

### Animations (GSAP)
- Page load: staggered card entrance (from bottom, fade in)
- Hover: cards lift with shadow increase
- Status changes: pulse animation
- Page transitions: smooth fade
- Loading: skeleton screens with shimmer

## Technical Requirements
- **Single HTML file** at `/opt/NyaTicketTools/web/index.html`
- **Inline CSS** in `<style>` tags (or link to style.css if too large)
- **Inline JS** in `<script>` tags (or link to app.js)
- **GSAP via CDN**: `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js`
- **Lucide icons via CDN**: `https://unpkg.com/lucide@latest`
- **No frameworks** (no React, Vue, etc.) - vanilla JS only
- **LocalStorage** for persisting accounts and ticket config
- **No backend needed** - this is a config management UI that generates config files for download

### API Endpoints (Future)
The UI should be designed so that later a Python backend can be added. Use fetch() calls to `/api/*` endpoints, with fallback to localStorage when API is unavailable.

### File Structure
```
web/
├── index.html          # Main HTML file
├── css/
│   └── style.css       # Styles (glassmorphism, dark theme)
├── js/
│   └── app.js          # Main application logic
└── assets/
    └── (any images)
```

OR if simpler:
```
web/
└── index.html          # Everything in one file
```

## Do NOT
- Use any npm/node/build tools
- Use emoji as icons
- Use bright/light theme
- Include any API keys or cookies in the code
- Make it depend on a backend server to function

## Deliverables
1. Complete HTML/CSS/JS files in `/opt/NyaTicketTools/web/`
2. The app should work by opening `index.html` directly in a browser
3. All animations should use GSAP
4. Test by running: `cd /opt/NyaTicketTools/web && python3 -m http.server 8080`
