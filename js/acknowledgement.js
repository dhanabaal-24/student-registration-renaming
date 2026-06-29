/**
 * acknowledgement.js
 * ==================
 * Generates a printable/downloadable registration acknowledgement.
 * Uses the browser's native print dialog with a print-optimized CSS.
 * No external PDF library required.
 */

'use strict';

import { formatDate, maskAadhaar } from './utils.js';

/**
 * Open a print-ready acknowledgement in a new window.
 *
 * @param {Object} student   - student record from DB
 * @param {Array}  documents - document records from DB
 */
export function printAcknowledgement(student, documents) {
    const html = generateAcknowledgementHTML(student, documents);

    const win = window.open('', '_blank', 'width=800,height=900,scrollbars=yes');
    if (!win) {
        // Popup blocked — fallback: generate in current window via iframe
        printViaIframe(html);
        return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    win.addEventListener('load', () => {
        win.focus();
        win.print();
    });
}

/**
 * Trigger download of acknowledgement as an HTML file
 * (which browsers can open and print as PDF via Ctrl+P).
 *
 * @param {Object} student
 * @param {Array}  documents
 */
export function downloadAcknowledgement(student, documents) {
    const html     = generateAcknowledgementHTML(student, documents);
    const blob     = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url      = URL.createObjectURL(blob);
    const link     = document.createElement('a');
    link.href      = url;
    link.download  = `MaFoi_Registration_${student.ma_foi_id}.html`;
    link.click();
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// HTML GENERATION
// ─────────────────────────────────────────────────────────────

function generateAcknowledgementHTML(student, documents) {
    const docList = DOCUMENT_TYPES_ORDERED.map(type => {
        const doc = documents.find(d => d.doc_type === type.doc_type);
        return `<tr>
            <td>${type.label}</td>
            <td class="${doc ? 'status-ok' : 'status-missing'}">${doc ? '✓ Uploaded' : '— Not uploaded'}</td>
        </tr>`;
    }).join('');

    const fatherAadhaar = student.father_aadhaar_masked
        ? student.father_aadhaar_masked.replace(':', 'XXX XXX')
        : '—';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registration Acknowledgement — ${student.ma_foi_id}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 13px;
            color: #1a1a2e;
            background: #fff;
            padding: 32px;
        }

        .ack-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            border-bottom: 3px solid #0E4BFF;
            padding-bottom: 20px;
            margin-bottom: 24px;
        }

        .ack-logo {
            font-size: 22px;
            font-weight: 800;
            color: #0E4BFF;
            letter-spacing: -0.5px;
        }

        .ack-logo span { color: #2FE6A6; }

        .ack-meta { text-align: right; font-size: 12px; color: #555; }
        .ack-meta strong { display: block; font-size: 14px; color: #0E4BFF; }

        h1 {
            font-size: 18px;
            font-weight: 700;
            color: #0E4BFF;
            margin-bottom: 20px;
            text-align: center;
        }

        .id-badge {
            background: #f0f4ff;
            border: 2px solid #0E4BFF;
            border-radius: 8px;
            padding: 12px 20px;
            display: inline-block;
            margin: 0 auto 24px;
            text-align: center;
            display: block;
            max-width: 280px;
            margin: 0 auto 28px;
        }
        .id-badge__label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
        .id-badge__value { font-size: 28px; font-weight: 800; color: #0E4BFF; letter-spacing: 2px; }

        .section {
            margin-bottom: 22px;
            page-break-inside: avoid;
        }

        .section__title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            color: #0E4BFF;
            border-bottom: 1px solid #d0d8ff;
            padding-bottom: 6px;
            margin-bottom: 12px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12.5px;
        }

        th, td {
            padding: 7px 10px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }

        th {
            width: 40%;
            color: #555;
            font-weight: 600;
            background: #fafafa;
        }

        td { color: #1a1a2e; }

        .status-ok     { color: #16a34a; font-weight: 600; }
        .status-missing { color: #dc2626; }

        .footer {
            margin-top: 32px;
            border-top: 1px solid #ddd;
            padding-top: 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 11px;
            color: #888;
        }

        .watermark {
            text-align: center;
            font-size: 10px;
            color: #bbb;
            margin-top: 12px;
        }

        .signature-block {
            margin-top: 40px;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
        }

        .sig-line {
            border-top: 1px solid #333;
            padding-top: 6px;
            font-size: 11px;
            color: #555;
        }

        @media print {
            body { padding: 20px; }
            .no-print { display: none !important; }
        }
    </style>
</head>
<body>

    <div class="ack-header">
        <div class="ack-logo">Ma Foi<span>.</span>ProSculpt</div>
        <div class="ack-meta">
            <strong>${student.program} Program — ${student.location}</strong>
            Batch: ${student.batch_id}<br>
            Date: ${formatDate(new Date().toISOString().split('T')[0])}<br>
            Generated: ${new Date().toLocaleTimeString('en-IN')}
        </div>
    </div>

    <h1>Registration Acknowledgement</h1>

    <div class="id-badge">
        <div class="id-badge__label">Ma Foi ID</div>
        <div class="id-badge__value">${student.ma_foi_id}</div>
    </div>

    <div class="section">
        <div class="section__title">Personal Information</div>
        <table>
            <tr><th>Full Name</th><td>${student.full_name || (student.first_name + ' ' + student.last_name)}</td></tr>
            <tr><th>Email Address</th><td>${student.email}</td></tr>
            <tr><th>Phone Number</th><td>${student.phone}</td></tr>
            <tr><th>Gender</th><td>${student.gender}</td></tr>
            <tr><th>Date of Birth</th><td>${formatDate(student.date_of_birth)}</td></tr>
            <tr><th>Aadhaar Number</th><td>${maskAadhaar(student.aadhaar_number)}</td></tr>
            <tr><th>Address</th><td>${student.address}</td></tr>
            <tr><th>Qualification</th><td>${student.educational_qualification}</td></tr>
            <tr><th>Graduation Year</th><td>${student.graduation_year}</td></tr>
        </table>
    </div>

    <div class="section">
        <div class="section__title">Program Enrollment</div>
        <table>
            <tr><th>Program</th><td>${student.program}</td></tr>
            <tr><th>Center Location</th><td>${student.location}</td></tr>
            <tr><th>Batch ID</th><td>${student.batch_id}</td></tr>
        </table>
    </div>

    <div class="section">
        <div class="section__title">Family Background</div>
        <table>
            <tr><th>Father's Name</th><td>${student.father_name || '—'}</td></tr>
            <tr><th>Mother's Name</th><td>${student.mother_name || '—'}</td></tr>
            <tr><th>Father's Occupation</th><td>${student.father_occupation || '—'}</td></tr>
            <tr><th>Parent Contact</th><td>${student.parent_contact || '—'}</td></tr>
            <tr><th>Total Family Members</th><td>${student.total_family_members || '—'}</td></tr>
            <tr><th>Annual Family Income</th><td>${student.annual_family_income || '—'}</td></tr>
            <tr><th>Father's Aadhaar (Partial)</th><td>${fatherAadhaar}</td></tr>
        </table>
    </div>

    <div class="section">
        <div class="section__title">Uploaded Documents</div>
        <table>
            <tr>
                <th>Document</th>
                <th>Status</th>
            </tr>
            ${docList}
        </table>
    </div>

    <div class="signature-block">
        <div>
            <div class="sig-line">Student Signature</div>
        </div>
        <div>
            <div class="sig-line">Centre Coordinator</div>
        </div>
        <div>
            <div class="sig-line">Authorized Signatory</div>
        </div>
    </div>

    <div class="footer">
        <div>Ma Foi Management Consultants Ltd. / CIEL HR Services</div>
        <div>This is a system-generated document.</div>
    </div>

    <div class="watermark">
        Generated by ProSculpt.ai Registration Portal · ${student.ma_foi_id} · ${new Date().toISOString()}
    </div>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS (mirrored from config to avoid circular import in HTML)
// ─────────────────────────────────────────────────────────────

const DOCUMENT_TYPES_ORDERED = [
    { doc_type: '10th_marksheet',   label: '10th Marksheet' },
    { doc_type: '12th_marksheet',   label: '12th Marksheet' },
    { doc_type: 'degree_certificate', label: '6th Sem Marksheet / Degree Certificate' },
    { doc_type: 'aadhaar_card',     label: 'Aadhaar Card' },
    { doc_type: 'ration_income',    label: 'Ration Card / Income Certificate' },
    { doc_type: 'signature',        label: 'Signature' },
    { doc_type: 'passport_photo',   label: 'Passport Size Photo' },
];

// ─────────────────────────────────────────────────────────────
// IFRAME FALLBACK
// ─────────────────────────────────────────────────────────────

function printViaIframe(html) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.contentWindow.addEventListener('load', () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => iframe.remove(), 2000);
    });
}
