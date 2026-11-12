"""Generates the Chen-notation ER diagram (er_diagram.svg) for the project.
Run:  python3 docs/er/make_er.py
"""
import math, os

W, H = 2060, 1330
DX = 120  # global x shift
out = []
lines = []

def X(x): return x + DX

# ---------------------------------------------------------------- primitives
def line(x1, y1, x2, y2, double=False, dashed=False):
    if not double:
        lines.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="ln{" dash" if dashed else ""}"/>')
        return
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    ox, oy = -dy / L * 3, dx / L * 3
    for s in (1, -1):
        lines.append(f'<line x1="{x1+s*ox:.1f}" y1="{y1+s*oy:.1f}" x2="{x2+s*ox:.1f}" y2="{y2+s*oy:.1f}" class="ln"/>')

def entity(x, y, name, weak=False, w=150, h=56):
    x = X(x)
    out.append(f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" class="ent"/>')
    if weak:
        out.append(f'<rect x="{x-w/2+5}" y="{y-h/2+5}" width="{w-10}" height="{h-10}" class="ent"/>')
    out.append(f'<text x="{x}" y="{y+5}" class="et">{name}</text>')
    return (x, y)

def assoc(x, y, name, w=170, h=70):
    """associative entity: rectangle with a diamond inside"""
    x = X(x)
    out.append(f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" class="ent"/>')
    out.append(f'<polygon points="{x-w/2+6},{y} {x},{y-h/2+5} {x+w/2-6},{y} {x},{y+h/2-5}" class="rel"/>')
    out.append(f'<text x="{x}" y="{y+5}" class="et">{name}</text>')
    return (x, y)

def rel(x, y, name, identifying=False, w=130, h=64):
    x = X(x)
    out.append(f'<polygon points="{x-w/2},{y} {x},{y-h/2} {x+w/2},{y} {x},{y+h/2}" class="rel"/>')
    if identifying:
        out.append(f'<polygon points="{x-w/2+9},{y} {x},{y-h/2+6} {x+w/2-9},{y} {x},{y+h/2-6}" class="rel"/>')
    out.append(f'<text x="{x}" y="{y+4}" class="rt">{name}</text>')
    return (x, y)

def attr(owner, x, y, name, kind='simple', rx=None):
    """kind: simple | key | partial | multi | derived | composite"""
    x = X(x)
    rx = rx or max(48, len(name) * 4.6 + 16)
    ry = 19
    line(owner[0], owner[1], x, y, dashed=False)
    cls = 'att dash' if kind == 'derived' else 'att'
    out.append(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" class="{cls}"/>')
    if kind == 'multi':
        out.append(f'<ellipse cx="{x}" cy="{y}" rx="{rx-5}" ry="{ry-5}" class="att"/>')
    tcls = 'at'
    out.append(f'<text x="{x}" y="{y+4}" class="{tcls}">{name}</text>')
    tw = len(name) * 7.0
    if kind == 'key':
        out.append(f'<line x1="{x-tw/2}" y1="{y+7}" x2="{x+tw/2}" y2="{y+7}" class="ul"/>')
    if kind == 'partial':
        out.append(f'<line x1="{x-tw/2}" y1="{y+7}" x2="{x+tw/2}" y2="{y+7}" class="ul dash"/>')
    return (x, y)

def card(x, y, t):
    out.append(f'<text x="{X(x)}" y="{y}" class="card">{t}</text>')

def note(x, y, t, cls='note'):
    out.append(f'<text x="{X(x)}" y="{y}" class="{cls}">{t}</text>')

def connect(a, b, double=False):
    line(a[0], a[1], b[0], b[1], double=double)

# ---------------------------------------------------------------- entities
THEATRE = entity(200, 200, 'THEATRE')
SCREEN  = entity(1000, 200, 'SCREEN')
SEAT    = entity(1600, 200, 'SEAT', weak=True)
MOVIE   = entity(600, 560, 'MOVIE')
SHOWS   = assoc(1000, 560, 'SHOWS')
USERS   = entity(200, 900, 'USERS')
BOOKING = entity(1000, 900, 'BOOKING')
PAYMENT = entity(1600, 900, 'PAYMENT')

# ---------------------------------------------------------------- relationships
HAS      = rel(600, 200, 'HAS')
CONTAINS = rel(1300, 200, 'CONTAINS', identifying=True, w=150)
MANAGES  = rel(200, 560, 'MANAGES', w=140)
MAKES    = rel(600, 900, 'MAKES')
FOR      = rel(1000, 730, 'FOR', w=110, h=56)
PAID_BY  = rel(1300, 900, 'PAID_BY', w=140)
RESERVES = rel(1600, 560, 'RESERVES', w=150)
REFERS   = rel(200, 1120, 'REFERS')

# THEATRE 1 --HAS-- N SCREEN (every screen belongs to a theatre: total)
connect(THEATRE, HAS); connect(HAS, SCREEN, double=True)
card(255, 190, '1'); card(915, 190, 'N')
# SCREEN 1 ==CONTAINS== N SEAT (identifying, SEAT total)
connect(SCREEN, CONTAINS); connect(CONTAINS, SEAT, double=True)
card(1090, 190, '1'); card(1510, 190, 'N')
# THEATRE 1 --MANAGES-- N USERS(admin)  (partial both sides)
connect(THEATRE, MANAGES); connect(MANAGES, USERS)
card(212, 260, '1'); card(212, 860, 'N')
note(265, 800, 'admin of', 'role'); note(270, 300, 'managed by', 'role')
# MOVIE M --[SHOWS]-- N SCREEN  (associative entity resolving M:N)
connect(MOVIE, SHOWS, double=True); connect(SHOWS, SCREEN, double=True)
card(690, 550, 'M'); card(1012, 260, 'N')
# USERS 1 --MAKES-- N BOOKING (BOOKING total)
connect(USERS, MAKES); connect(MAKES, BOOKING, double=True)
card(290, 890, '1'); card(910, 890, 'N')
# SHOWS 1 --FOR-- N BOOKING (BOOKING total)
connect(SHOWS, FOR); connect(FOR, BOOKING, double=True)
card(1012, 618, '1'); card(1012, 862, 'N')
# BOOKING 1 --PAID_BY-- 1 PAYMENT (PAYMENT total)
connect(BOOKING, PAID_BY); connect(PAID_BY, PAYMENT, double=True)
card(1090, 890, '1'); card(1510, 890, '1')
# BOOKING M --RESERVES-- N SEAT (via BOOKING_SEAT)
connect(SEAT, RESERVES); connect(RESERVES, BOOKING, double=True)
card(1612, 260, 'N'); card(1065, 845, 'M')
# USERS recursive REFERS
line(USERS[0] - 40, USERS[1] + 28, REFERS[0] - 65, REFERS[1])
line(USERS[0] + 40, USERS[1] + 28, REFERS[0] + 65, REFERS[1])
card(108, 1025, '1'); card(285, 1025, 'N')
note(70, 1170, 'referrer', 'role'); note(330, 1170, 'referred', 'role')

# ---------------------------------------------------------------- attributes
attr(THEATRE, 70, 80, 'Theatre_ID', 'key')
attr(THEATRE, 200, 60, 'Name')
attr(THEATRE, 330, 80, 'City')
attr(THEATRE, 400, 140, 'Address')

attr(SCREEN, 880, 75, 'Screen_ID', 'key')
attr(SCREEN, 1120, 75, 'Screen_No')

attr(SEAT, 1470, 75, 'Row_No', 'partial')
attr(SEAT, 1600, 55, 'Seat_No', 'partial')
attr(SEAT, 1740, 85, 'Seat_Type')

attr(MOVIE, 440, 440, 'Movie_ID', 'key')
attr(MOVIE, 600, 420, 'Title')
attr(MOVIE, 760, 440, 'Language')
attr(MOVIE, 430, 680, 'Duration_Min')
attr(MOVIE, 600, 710, 'Release_Date')
attr(MOVIE, 770, 680, 'Genre', 'multi')
attr(MOVIE, 420, 560, 'Poster_URL')

attr(SHOWS, 1200, 470, 'Show_ID', 'key')
attr(SHOWS, 1215, 560, 'Show_Time')
attr(SHOWS, 1200, 650, 'Base_Price')

attr(BOOKING, 820, 1030, 'Booking_ID', 'key')
attr(BOOKING, 950, 1070, 'Booked_At')
attr(BOOKING, 1075, 1070, 'Status')
attr(BOOKING, 1210, 1030, 'Total_Amount', 'derived')

attr(PAYMENT, 1470, 1030, 'Payment_ID', 'key')
attr(PAYMENT, 1600, 1065, 'Amount')
attr(PAYMENT, 1730, 1030, 'Method')
attr(PAYMENT, 1790, 960, 'Status')
attr(PAYMENT, 1770, 820, 'Paid_At')

attr(USERS, -20, 790, 'User_ID', 'key')
attr(USERS, -40, 870, 'Email')
attr(USERS, -40, 950, 'Password_Hash')
attr(USERS, 400, 790, 'Role')
attr(USERS, -10, 1030, 'Created_At')
NAME = attr(USERS, 540, 1060, 'Name')
attr(NAME, 470, 1150, 'First_Name')
attr(NAME, 630, 1150, 'Last_Name')
note(540, 1035, 'composite', 'tiny')

# ---------------------------------------------------------------- legend
lx, ly = X(1300), 1110
legend = f'''
<g transform="translate({lx},{ly})">
  <rect x="0" y="0" width="520" height="140" rx="8" class="legend"/>
  <text x="14" y="22" class="lh">Notation (Chen)</text>
  <rect x="14" y="34" width="44" height="22" class="ent"/><text x="66" y="50" class="lt">Strong entity</text>
  <rect x="14" y="64" width="44" height="22" class="ent"/><rect x="17" y="67" width="38" height="16" class="ent"/><text x="66" y="80" class="lt">Weak entity</text>
  <polygon points="14,108 36,96 58,108 36,120" class="rel"/><text x="66" y="112" class="lt">Relationship</text>
  <polygon points="150,45 172,33 194,45 172,57" class="rel"/><polygon points="157,45 172,37 187,45 172,53" class="rel"/><text x="202" y="50" class="lt">Identifying rel.</text>
  <ellipse cx="172" cy="75" rx="22" ry="10" class="att"/><text x="202" y="80" class="lt"><tspan text-decoration="underline">Key</tspan> / partial key (dashed)</text>
  <ellipse cx="172" cy="105" rx="22" ry="10" class="att"/><ellipse cx="172" cy="105" rx="17" ry="6" class="att"/><text x="202" y="110" class="lt">Multivalued</text>
  <ellipse cx="370" cy="45" rx="22" ry="10" class="att dash"/><text x="400" y="50" class="lt">Derived</text>
  <line x1="350" y1="72" x2="392" y2="72" class="ln"/><line x1="350" y1="78" x2="392" y2="78" class="ln"/><text x="400" y="80" class="lt">Total participation</text>
  <line x1="350" y1="105" x2="392" y2="105" class="ln"/><text x="400" y="110" class="lt">Partial participation</text>
</g>'''

style = '''
<style>
  .ln{stroke:#222;stroke-width:1.6}
  .dash{stroke-dasharray:6 4}
  .ent{fill:#fff7e6;stroke:#b3541e;stroke-width:2}
  .rel{fill:#e8f1ff;stroke:#2f5fb3;stroke-width:2}
  .att{fill:#ffffff;stroke:#555;stroke-width:1.4}
  .att.dash{stroke-dasharray:5 3}
  .ul{stroke:#111;stroke-width:1.2}
  .ul.dash{stroke-dasharray:3 2}
  text{font-family:Helvetica,Arial,sans-serif;text-anchor:middle;fill:#111}
  .et{font-weight:700;font-size:16px}
  .rt{font-weight:700;font-size:12.5px;fill:#1d3f80}
  .at{font-size:12.5px}
  .card{font-weight:700;font-size:17px;fill:#c21d1d}
  .role{font-style:italic;font-size:12px;fill:#666}
  .tiny{font-style:italic;font-size:10.5px;fill:#777}
  .note{font-size:12px;fill:#444}
  .legend{fill:#fafafa;stroke:#bbb}
  .lh{font-weight:700;font-size:13px;text-anchor:start}
  .lt{font-size:12px;text-anchor:start}
  .title{font-size:24px;font-weight:700;text-anchor:start}
  .sub{font-size:13px;fill:#555;text-anchor:start}
</style>'''

title = (f'<text x="30" y="40" class="title">ER Diagram – Online Movie Ticket Booking &amp; Theatre Management System</text>'
         f'<text x="30" y="62" class="sub">8 entities (1 weak) · 1:1, 1:N, M:N, recursive &amp; identifying relationships · '
         f'composite, multivalued, derived, key &amp; partial-key attributes</text>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
       f'{style}<rect width="100%" height="100%" fill="#fff"/>{title}<g transform="translate(0,70)">'
       + ''.join(lines) + ''.join(out) + legend + '</g></svg>')

here = os.path.dirname(os.path.abspath(__file__))
open(os.path.join(here, 'er_diagram.svg'), 'w').write(svg)
print('written', os.path.join(here, 'er_diagram.svg'))
