"""
Generates a professional Texas wholesale contract package as a PDF:
  - Cover / how-to-use + legal disclaimer
  - Residential Real Estate Purchase & Sale Agreement (assignable)
  - Assignment of Real Estate Contract
Pre-filled with a real lead from the pipeline; blanks for the negotiated terms.
"""
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, HRFlowable
)

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "contracts")
os.makedirs(OUT_DIR, exist_ok=True)
OUT = os.path.join(OUT_DIR, "Wholesale_Contract_Package.pdf")

# --- Deal data (pre-filled from the verified pipeline / HCAD) ---
SELLER = "RODRIGUEZ EDGAR JAVIER"          # real HCAD owner of the sample property
PROPERTY = "7307 Krueger Rd, Houston, TX 77016"
COUNTY = "Harris"
BUYER = "Mohammed Henna"

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Title"], fontSize=18, spaceAfter=6, textColor=colors.HexColor("#111111"))
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12, spaceBefore=10, spaceAfter=4, textColor=colors.HexColor("#1a1a1a"))
BODY = ParagraphStyle("BODY", parent=styles["Normal"], fontSize=9.5, leading=14, alignment=TA_JUSTIFY)
SMALL = ParagraphStyle("SMALL", parent=styles["Normal"], fontSize=8, leading=11, textColor=colors.HexColor("#555555"))
CLAUSE = ParagraphStyle("CLAUSE", parent=BODY, spaceAfter=6)
CENTER = ParagraphStyle("CENTER", parent=BODY, alignment=TA_CENTER)
DISC = ParagraphStyle("DISC", parent=BODY, fontSize=9, leading=13, backColor=colors.HexColor("#FFF7E6"), borderColor=colors.HexColor("#E0A800"), borderWidth=1, borderPadding=8)

story = []

def rule():
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#999999")))
    story.append(Spacer(1, 6))

def field(label, value=""):
    return Paragraph(f"<b>{label}:</b> {value if value else '_______________________________________'}", BODY)

# ============================ COVER ============================
story.append(Paragraph("WHOLESALE CONTRACT PACKAGE", H1))
story.append(Paragraph("Texas Residential Real Estate — Purchase &amp; Sale + Assignment", H2))
rule()
story.append(Paragraph("How to use this package", H2))
for i, t in enumerate([
    "When a seller agrees to your price, fill in the blanks in the <b>Purchase &amp; Sale Agreement</b> (Section A) — price, earnest money, closing date — and both you and the seller sign &amp; date it. This puts the property under contract in your name.",
    "Your name is entered as Buyer with the words <b>“and/or assigns.”</b> That single phrase is what makes the contract assignable — it lets you transfer it to a cash buyer.",
    "When your cash buyer agrees, fill in the <b>Assignment of Contract</b> (Section B) — assignee name and your assignment fee — and both sign. Your fee is your profit.",
    "Take both signed documents to a <b>title company / real estate attorney</b> to close. They handle the money and the deed. You get paid at closing.",
]):
    story.append(Paragraph(f"<b>{i+1}.</b> {t}", CLAUSE))

story.append(Spacer(1, 8))
story.append(Paragraph(
    "<b>IMPORTANT — READ THIS.</b> This is a reusable <b>template</b>, not legal advice, and it has not been reviewed by an attorney for your situation. "
    "Texas law (Tex. Occ. Code §1101.0045) requires that a person selling or assigning an <b>equitable interest</b> in a contract — which is what wholesaling is — "
    "<b>disclose in writing</b> to the buyer that they are assigning a contract and do not hold legal title. That disclosure is built into Section A (clause 9) and Section B. "
    "Before you use this for real deals, have a Texas real estate attorney or title company review it and confirm it meets current law. Wholesaling without proper disclosure can be treated as unlicensed brokerage.",
    DISC))
story.append(Spacer(1, 10))
story.append(Paragraph("Prepared by WholesaleOS — pre-filled with a verified lead from your pipeline. Replace the property &amp; seller on each new deal.", SMALL))
story.append(PageBreak())

# ============================ SECTION A: PSA ============================
story.append(Paragraph("SECTION A — RESIDENTIAL PURCHASE &amp; SALE AGREEMENT", H1))
story.append(Paragraph("(Assignable)", CENTER))
rule()

story.append(field("Effective Date"))
story.append(Spacer(1, 4))
story.append(Paragraph("<b>1. Parties.</b>", H2))
story.append(field("Seller", SELLER))
story.append(field("Buyer", f"{BUYER}, <b>and/or assigns</b>"))
story.append(Spacer(1, 4))

story.append(Paragraph("<b>2. Property.</b> Seller agrees to sell and convey to Buyer the real property and all improvements located at:", BODY))
story.append(field("Address", PROPERTY))
story.append(field("County", COUNTY + " County, Texas"))
story.append(field("Legal description (or 'per title commitment')"))
story.append(Spacer(1, 4))

story.append(Paragraph("<b>3. Purchase Price.</b>", H2))
story.append(field("Total purchase price (USD)", "$ ______________"))
story.append(field("Earnest money (held by title company)", "$ ______________"))
story.append(Spacer(1, 4))

story.append(Paragraph("<b>4. Option / Inspection Period.</b> Buyer shall have ____ days from the Effective Date to inspect the Property and may terminate for any reason during this period, in which case the earnest money is refunded to Buyer.", CLAUSE))

story.append(Paragraph("<b>5. Title &amp; Closing.</b> Closing shall occur on or before ____________, 20____, at a title company of Buyer's choice. Seller shall convey marketable title by general warranty deed, free of liens except as agreed. Seller pays for the owner's title policy unless otherwise agreed.", CLAUSE))

story.append(Paragraph("<b>6. Condition.</b> The Property is sold <b>AS-IS, WHERE-IS</b>, with all faults. Buyer relies on its own inspection. Seller makes no warranty as to condition.", CLAUSE))

story.append(Paragraph("<b>7. Possession.</b> Possession shall be delivered to Buyer at closing and funding, unless a separate written agreement provides otherwise.", CLAUSE))

story.append(Paragraph("<b>8. Assignment.</b> Buyer may assign, transfer, or convey all of Buyer's rights and obligations under this Agreement to a third party without further consent of Seller. Upon assignment and the assignee's assumption of Buyer's obligations, the original Buyer is released.", CLAUSE))

story.append(Paragraph("<b>9. Equitable Interest Disclosure (Texas).</b> Buyer discloses to Seller that Buyer is acquiring an <b>equitable interest</b> in the Property through this Agreement and <b>may sell or assign this contract</b> to another party for a fee or profit. Buyer <b>does not hold legal title</b> to the Property and is acting as a principal buyer, not as a licensed real estate broker or agent on Seller's behalf.", CLAUSE))

story.append(Paragraph("<b>10. Default.</b> If Buyer defaults, Seller's sole remedy is to retain the earnest money as liquidated damages. If Seller defaults, Buyer may seek specific performance or a refund of earnest money.", CLAUSE))

story.append(Paragraph("<b>11. Entire Agreement.</b> This Agreement is the entire agreement of the parties and may be amended only in writing signed by both parties. Governed by the laws of the State of Texas.", CLAUSE))

story.append(Spacer(1, 14))
sig = [
    [Paragraph("<b>SELLER</b>", BODY), Paragraph("<b>BUYER</b>", BODY)],
    [Paragraph("____________________________", BODY), Paragraph("____________________________", BODY)],
    [Paragraph(f"{SELLER}", SMALL), Paragraph("(Buyer, and/or assigns)", SMALL)],
    [Paragraph("Date: ______________", BODY), Paragraph("Date: ______________", BODY)],
]
t = Table(sig, colWidths=[3.2*inch, 3.2*inch])
t.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("TOPPADDING",(0,0),(-1,-1),8)]))
story.append(t)
story.append(PageBreak())

# ============================ SECTION B: ASSIGNMENT ============================
story.append(Paragraph("SECTION B — ASSIGNMENT OF REAL ESTATE CONTRACT", H1))
rule()
story.append(Paragraph("This Assignment is made on ____________, 20____, between:", BODY))
story.append(field("Assignor (you — the wholesaler)", BUYER))
story.append(field("Assignee (your cash buyer)"))
story.append(Spacer(1, 6))

story.append(Paragraph("<b>1. The Contract.</b> Assignor is the Buyer under that certain Residential Purchase &amp; Sale Agreement dated ____________ (the “Contract”) for the property located at:", CLAUSE))
story.append(field("Property", PROPERTY))

story.append(Paragraph("<b>2. Assignment.</b> For value received, Assignor assigns and transfers to Assignee all of Assignor's right, title, and interest in and to the Contract. Assignee accepts the assignment and assumes all of Assignor's obligations under the Contract.", CLAUSE))

story.append(Paragraph("<b>3. Assignment Fee.</b> In consideration of this assignment, Assignee shall pay Assignor a non-refundable assignment fee of:", CLAUSE))
story.append(field("Assignment fee (USD)", "$ ______________"))
story.append(Paragraph("payable at closing through the title company, or as follows: ________________________________________.", BODY))

story.append(Paragraph("<b>4. Disclosure.</b> Assignee acknowledges that Assignor is assigning an <b>equitable interest in a contract</b> and does not hold legal title to the Property. Assignee has performed its own due diligence on the Property and the Contract.", CLAUSE))

story.append(Paragraph("<b>5. Closing.</b> Assignee shall close in accordance with the terms of the Contract. This Assignment is governed by the laws of the State of Texas.", CLAUSE))

story.append(Spacer(1, 14))
sig2 = [
    [Paragraph("<b>ASSIGNOR</b>", BODY), Paragraph("<b>ASSIGNEE</b>", BODY)],
    [Paragraph("____________________________", BODY), Paragraph("____________________________", BODY)],
    [Paragraph("(You — the wholesaler)", SMALL), Paragraph("(Your cash buyer)", SMALL)],
    [Paragraph("Date: ______________", BODY), Paragraph("Date: ______________", BODY)],
]
t2 = Table(sig2, colWidths=[3.2*inch, 3.2*inch])
t2.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("TOPPADDING",(0,0),(-1,-1),8)]))
story.append(t2)
story.append(Spacer(1, 16))
story.append(Paragraph("Template generated by WholesaleOS. Not legal advice — have a Texas attorney or title company review before use.", SMALL))

doc = SimpleDocTemplate(OUT, pagesize=letter, topMargin=0.7*inch, bottomMargin=0.7*inch, leftMargin=0.8*inch, rightMargin=0.8*inch,
                        title="Wholesale Contract Package", author="WholesaleOS")
doc.build(story)
print(f"OK -> {OUT}")
