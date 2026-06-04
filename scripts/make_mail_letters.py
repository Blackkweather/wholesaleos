"""
Batch direct-mail letters — reads contracts/mail-list.json and produces a single
print-ready PDF: one personalized cash-offer letter per page, each with the
owner's real mailing address at the top (for a #10 window envelope).

Print it, fold each page, stuff in window envelopes, stamp, mail. That's outreach.
Set YOUR name + phone below, then run:  python scripts/make_mail_letters.py
"""
import os, json, datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

# ============== SET THESE ONCE ==============
SENDER_NAME  = "Mohammed Henna"
SENDER_PHONE = "+1 (424) 699-3912"
# ============================================

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "contracts", "mail-list.json")
OUT  = os.path.join(BASE, "contracts", "Mail_Letters_BATCH.pdf")

ENTITY = ("TRUST", "LLC", "INC", "LP", "CORP", "PARTNERS", "PROPERTIES",
          "HOMES", "COMPANY", "GROUP", "CAPITAL", "INVESTMENTS", "HOLDINGS")

def title(s):
    return " ".join(w.capitalize() for w in str(s).split())

def greeting_name(owner):
    o = (owner or "").upper()
    if any(e in o for e in ENTITY):
        return "Property Owner"
    toks = o.split()
    # HCAD format is usually LASTNAME FIRSTNAME MIDDLE → first name is 2nd token
    if len(toks) >= 2:
        return title(toks[1])
    return title(toks[0]) if toks else "Property Owner"

styles = getSampleStyleSheet()
ADDR = ParagraphStyle("ADDR", parent=styles["Normal"], fontSize=11, leading=15)
BODY = ParagraphStyle("BODY", parent=styles["Normal"], fontSize=11.5, leading=17)
SIGN = ParagraphStyle("SIGN", parent=styles["Normal"], fontSize=11.5, leading=16)
PS   = ParagraphStyle("PS", parent=styles["Normal"], fontSize=11, leading=15, textColor=colors.HexColor("#333333"))

with open(DATA, encoding="utf-8") as f:
    rows = json.load(f)

today = datetime.date.today().strftime("%B %d, %Y")
story = []

for i, r in enumerate(rows):
    owner_disp = title(r["owner"])
    name = greeting_name(r["owner"])
    prop = r["property"]
    mailing = r["mailing"]

    # Owner mailing block (positioned for a #10 window envelope)
    story.append(Spacer(1, 0.4 * inch))
    story.append(Paragraph(owner_disp, ADDR))
    for line in str(mailing).split(","):
        if line.strip():
            story.append(Paragraph(title(line.strip()) if not any(c.isdigit() for c in line) else line.strip(), ADDR))
    story.append(Spacer(1, 0.5 * inch))
    story.append(Paragraph(today, BODY))
    story.append(Spacer(1, 0.25 * inch))

    story.append(Paragraph(f"Dear {name},", BODY))
    story.append(Spacer(1, 0.12 * inch))
    story.append(Paragraph(
        f"My name is {SENDER_NAME} and I'm a local home buyer here in the Houston area. "
        f"I'm reaching out because I'm interested in buying your property at <b>{prop}</b>.", BODY))
    story.append(Spacer(1, 0.10 * inch))
    story.append(Paragraph(
        "I can pay <b>cash</b>, close on <b>your</b> timeline, and buy it exactly <b>as-is</b> — "
        "you wouldn't pay any agent commissions, repair costs, or closing fees. No showings, no hassle.", BODY))
    story.append(Spacer(1, 0.10 * inch))
    story.append(Paragraph(
        f"If you'd consider selling — even somewhere down the road — I'd love to make you a fair, "
        f"no-obligation cash offer. Just call or text me at <b>{SENDER_PHONE}</b>, or reply to this letter.", BODY))
    story.append(Spacer(1, 0.10 * inch))
    story.append(Paragraph("There's no pressure at all. Even a quick \"maybe someday\" is worth a conversation.", BODY))
    story.append(Spacer(1, 0.25 * inch))
    story.append(Paragraph("Sincerely,", SIGN))
    story.append(Spacer(1, 0.30 * inch))
    story.append(Paragraph(f"{SENDER_NAME}", SIGN))
    story.append(Paragraph(f"{SENDER_PHONE}", SIGN))
    story.append(Spacer(1, 0.20 * inch))
    story.append(Paragraph(
        f"<i>P.S. If {prop.split(',')[0]} isn't for sale, no worries at all — "
        f"feel free to keep my number for whenever the time is right.</i>", PS))

    if i < len(rows) - 1:
        story.append(PageBreak())

doc = SimpleDocTemplate(OUT, pagesize=letter, topMargin=0.8*inch, bottomMargin=0.8*inch,
                        leftMargin=1.0*inch, rightMargin=1.0*inch,
                        title="Direct Mail Letters", author="WholesaleOS")
doc.build(story)
print(f"OK -> {OUT}  ({len(rows)} letters)")
