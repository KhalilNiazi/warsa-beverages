import React from 'react';
import { SaleRecord, Outlet } from '@/src/types';
import { format } from 'date-fns';
import { Scissors } from 'lucide-react';
import { buildStandardInvoicePrintItems } from '@/src/utils/invoicePrintHelper';

export const PrintOrderView = ({ sale, outlets }: { sale: SaleRecord | null, outlets: Outlet[] }) => {
  if (!sale) return null;
  const outlet = outlets.find(o => o.Name === sale.OutletName || o.Address === sale.Address);
  const outletCode = outlet?.Code || sale.OutletCode || '79';
  const customerBalance = outlet?.OpeningBalance !== undefined ? outlet.OpeningBalance : sale.GrandTotal;

  const invoiceDateTime = sale.Date ? (() => {
    try {
      return format(new Date(sale.Date), 'M/d/yyyy HH:mm');
    } catch {
      return sale.Date;
    }
  })() : '4/16/2026 14:51';

  // Always include all 4 canonical items (500ml, 1500ml, 19 L, Promo 500ml); unadded items show 0
  const processedItems = buildStandardInvoicePrintItems(sale, outlet);

  const SingleInvoiceSheet = ({ isCustomerCopy }: { isCustomerCopy: boolean }) => {
    return (
      <div className="warsa-invoice">
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <symbol id="pov-phone" viewBox="0 0 24 24">
              <path fill="currentColor" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/>
            </symbol>
            <symbol id="pov-pin" viewBox="0 0 24 32">
              <path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0zm0 17a5 5 0 110-10 5 5 0 010 10z" fillRule="evenodd"/>
            </symbol>
          </defs>
        </svg>

        <div className="header">
          <div className="white"></div>
          <div className="redbg"></div>
          <div className="brand-small">KFM BEVERAGES</div>
          <div className="brand-big">WARSA</div>
          <div className="brand-sub">KFM BEVERAGES (WARSA) &bull; BOTTLED DRINKING WATER &bull; NTN: H039315</div>
          <div className="abs top-right-copy">{isCustomerCopy ? 'CUSTOMER COPY' : 'ORIGINAL COPY'}</div>
          <div className="vline"></div>
          <div className="code-top">CODE</div>
          <div className="code-top-n" style={{ fontSize: (outletCode || '').length > 6 ? '32px' : (outletCode || '').length > 3 ? '44px' : '68px' }}>
            {outletCode}
          </div>
        </div>

        <svg className="abs addr-pin" style={{ color: 'var(--red)' }}>
          <use href="#pov-pin"/>
        </svg>
        <div className="abs addr-text">
          40-1 Saddar Bazar<br/>Dhaka Road Lahore Cantt
        </div>
        <div className="abs addr-div"></div>
        <div className="abs phone-circle">
          <svg style={{ color: '#fff' }}>
            <use href="#pov-phone"/>
          </svg>
        </div>
        <div className="abs addr-phone">[0314-1421965]</div>

        <div className="abs frame"></div>

        <div className="row r1">
          <div className="ic">
            <svg viewBox="0 0 32 32" fill="none" stroke="#fff" strokeWidth="1.8">
              <path d="M4 12l3-7h18l3 7M4 12h24M6 12v15h20V12M11 27v-8h10v8M4 12c0 3 5 3 5 0 0 3 6 3 6 0 0 3 6 3 6 0 0 3 5 3 5 0"/>
            </svg>
          </div>
          <div className="lbl">OUTLET NAME</div>
          <div className="val">{sale.OutletName}</div>
          <div className="lbl">INVOICE #</div>
          <div className="inv-num-cell">{sale.ID}</div>
        </div>

        <div className="row r2">
          <div className="ic">
            <svg viewBox="0 0 32 32" fill="none" stroke="#fff" strokeWidth="1.8">
              <circle cx="7" cy="8" r="3"/><circle cx="25" cy="7" r="3"/>
              <circle cx="8" cy="25" r="3"/><circle cx="25" cy="24" r="3"/>
              <path d="M10 8h10M25 10v11M11 25h11M7 11v11" strokeDasharray="3 2"/>
            </svg>
          </div>
          <div className="lbl">ROUT</div>
          <div className="val">{sale.Route || 'IQBAL TOWN'}</div>
          <div className="lbl">DATE#</div>
          <div className="date">{invoiceDateTime}</div>
        </div>

        <div className="row r3">
          <div className="ic">
            <svg viewBox="0 0 24 32" fill="none" stroke="#fff" strokeWidth="1.8">
              <path d="M12 2C6.5 2 2 6.500 2 12c0 7.500 10 18 10 18s10-10.500 10-18C22 6.500 17.500 2 12 2z"/>
              <circle cx="12" cy="12" r="4"/>
            </svg>
          </div>
          <div className="lbl">ADDRESS</div>
          <div className="val sm">{sale.Address || 'NEAR PUNJAB UNIVERSITY'}</div>
          <div className="lbl">STATUS</div>
          <div className="val sm">{sale.DeliveryStatus || sale.Status || 'Delivered'}</div>
        </div>

        <div className="row r4">
          <div className="ic">
            <svg viewBox="0 0 32 32" fill="none" stroke="#fff" strokeWidth="1.8">
              <circle cx="16" cy="16" r="12"/>
              <path d="M11 10l3 0 1.500 4-2 1.500c1 2 2.500 3.500 4.500 4.500l1.500-2 4 1.500 0 3c-8 1-14-5-13-12z" strokeWidth="1.4"/>
            </svg>
          </div>
          <div className="lbl s">Contact Number</div>
          <div className="val">{sale.ContactNumber || outlet?.ContactNumber || '0370-6253203'}</div>
          <div className="lbl own">OWNER</div>
          <div className="val">{sale.OwnerName || outlet?.OwnerName || 'WASEEM'}</div>
          <div className="val">{sale.BookedBy || sale.OrderBooker || outlet?.OB || 'AOUN ALI'}</div>
        </div>

        <div className="abs cell credit-h">{sale.PaymentMethod || 'CREDIT'}</div>
        <div className="abs cell credit-v">{customerBalance.toLocaleString()}</div>
        <svg className="abs side-phone" style={{ color: 'var(--red)' }}>
          <use href="#pov-phone"/>
        </svg>
        <div className="abs side-num1">03413475816</div>
        <div className="abs side-line"></div>
        <svg className="abs side-wa" viewBox="0 0 32 32" fill="none" stroke="#dd0000" strokeWidth="2.2">
          <path d="M16 3a13 13 0 00-11 19.500L3 29l6.700-2A13 13 0 1016 3z"/>
          <path d="M11 10c0 5 5 10 10 10l2-2.500-3-1.500-1.500 1.200c-1.500-.7-3-2.200-3.700-3.700l1.200-1.500L14 9z" fill="#dd0000" stroke="none"/>
        </svg>
        <div className="abs side-num2">03415956432 <small>(WhatsApp)</small></div>

        <div className="abs th">
          <div>ITEMS</div>
          <div>DESCRIPTION</div>
          <div>QUANTITY</div>
          <div>FULL PRICE</div>
          <div>AMOUNT</div>
        </div>

        {processedItems.slice(0, 5).map((it, idx) => {
          const rowClass = `tr t${idx + 1} ${it.isAlt ? 'alt' : ''}`;
          return (
            <div key={idx} className={rowClass}>
              <div>{it.desc ? it.num : ''}</div>
              <div>{it.isPromo ? <em>{it.desc}</em> : it.desc}</div>
              <div>{it.qty}</div>
              <div>{it.price}</div>
              <div>{it.amount}</div>
            </div>
          );
        })}

        <div className="abs total-cases">
          <div className="tc-l">TOTAL CASES</div>
          <div>{sale.TotalCases}</div>
          <div></div>
        </div>

        <div className="abs sig-label">Customer Signature</div>
        <div className="abs sig-dots"></div>

        <div className="abs tot tt1">
          <div className="k">TOTAL AMOUNT</div>
          <div className="v">{sale.TotalAmount}</div>
        </div>
        <div className="abs tot tt2">
          <div className="k">DISCOUNT</div>
          <div className="v">{sale.Discount || 0}</div>
        </div>
        <div className="abs tot tt3">
          <div className="k">GRAND TOTAL</div>
          <div className="v">{sale.GrandTotal}</div>
        </div>

        <div className="abs ty-line-l"></div>
        <div className="abs ty-dot" style={{ left: '303px' }}></div>
        <div className="abs ty-text">Thank you for your business!</div>
        <div className="abs ty-dot" style={{ left: '818px' }}></div>
        <div className="abs ty-line-r"></div>

        <div className="footer">
          <div className="redbg"></div>
          <div className="whiteedge"></div>
        </div>
        <div className="abs f-pin">
          <svg style={{ color: '#fff' }}>
            <use href="#pov-pin"/>
          </svg>
        </div>
        <div className="abs f-addr">
          40-1 Saddar Bazar<br/>Dhaka Road Lahore Cantt
        </div>
        <div className="abs f-div"></div>
        <div className="abs f-phone-c">
          <svg style={{ color: '#fff' }}>
            <use href="#pov-phone"/>
          </svg>
        </div>
        <div className="abs f-phone">[0314-1421965]</div>
        <div className="abs code-bot">CODE</div>
        <div className="abs code-bot-n" style={{ fontSize: (outletCode || '').length > 6 ? '30px' : (outletCode || '').length > 3 ? '42px' : '60px' }}>
          {outletCode}
        </div>
      </div>
    );
  };

  return (
    <div id="printable-invoice-page" className="hidden print:flex flex-col items-center w-full warsa-print-page-wrapper">
      <style type="text/css" media="print">
        {`
          @page { size: 11in 8.5in; margin: 0; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: white; margin: 0; padding: 0; }
          :root {
            --red:#dd0000;
            --red-dark:#c80000;
            --red-line:#e0322d;
            --pink:#fbe2e2;
            --black:#1a1c1f;
            --text:#1b1b1b;
          }
          .warsa-print-container {
            width: 1156px;
            transform: scale(0.382);
            transform-origin: top center;
            margin: 0 auto;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .warsa-invoice {
            position: relative;
            width: 1156px;
            height: 1360px;
            background: #fff;
            overflow: hidden;
            font-family: 'Barlow', Arial, sans-serif;
            color: var(--text);
          }
          .warsa-invoice .abs { position: absolute; }
          .warsa-invoice .cell { display: flex; align-items: center; }
          .warsa-invoice .header { position: absolute; left: 0; top: 0; width: 1156px; height: 228px; background: var(--black); }
          .warsa-invoice .header .white { position: absolute; inset: 0; background: #fff; clip-path: polygon(0 0, 920px 0, 760px 228px, 0 228px); }
          .warsa-invoice .header .redbg { position: absolute; inset: 0; background: var(--red); clip-path: polygon(0 0, 912px 0, 750px 228px, 0 228px); }
          .warsa-invoice .header .vline { position: absolute; left: 925px; top: 60px; width: 1px; height: 140px; background: rgba(255,255,255,.75); }
          .warsa-invoice .top-right-copy { position: absolute; right: 24px; top: 16px; color: #ffffff; font: 700 20px/1 'Oswald', sans-serif; letter-spacing: 2px; text-transform: uppercase; white-space: nowrap; padding: 4px 14px; border: 1.5px solid rgba(255,255,255,.8); background: rgba(255,255,255,.12); border-radius: 4px; z-index: 15; }
          .warsa-invoice .code-top { position: absolute; right: 20px; width: 200px; top: 64px; text-align: center; color: #fff; font: 600 36px/1 'Oswald', sans-serif; letter-spacing: 1px; }
          .warsa-invoice .code-top-n { position: absolute; right: 20px; width: 200px; top: 108px; text-align: center; color: var(--red); font-weight: 700; font-family: 'Oswald', sans-serif; line-height: 1; white-space: nowrap; display: flex; align-items: center; justify-content: center; overflow: visible; }
          .warsa-invoice .brand-small { position: absolute; left: 55px; width: auto; top: 38px; text-align: left; color: #fff; font: 700 28px/1 'Oswald', sans-serif; letter-spacing: 1.5px; }
          .warsa-invoice .brand-big { position: absolute; left: 55px; width: auto; top: 68px; text-align: left; color: #fff; font: 700 102px/1 'Oswald', sans-serif; letter-spacing: 2px; transform: scaleY(1.02); }
          .warsa-invoice .brand-sub { position: absolute; left: 55px; width: auto; top: 174px; text-align: left; color: #fff; font: 600 16px/1 'Barlow', sans-serif; letter-spacing: 3.5px; }
          .warsa-invoice .addr-pin { left: 62px; top: 250px; width: 36px; height: 46px; }
          .warsa-invoice .addr-text { left: 119px; top: 247px; font: 700 22px/26px 'Barlow', sans-serif; color: #111; }
          .warsa-invoice .addr-div { left: 481px; top: 249px; width: 1px; height: 52px; background: #c9c9c9; }
          .warsa-invoice .phone-circle { left: 526px; top: 249px; width: 52px; height: 52px; border-radius: 50%; background: var(--red); }
          .warsa-invoice .phone-circle svg { position: absolute; left: 12px; top: 12px; width: 28px; height: 28px; }
          .warsa-invoice .addr-phone { left: 606px; top: 259px; font: 700 24px/32px 'Barlow', sans-serif; color: #111; }
          .warsa-invoice .frame { left: 35px; top: 322px; width: 1086px; height: 846px; border: 1px solid var(--red-line); }
          .warsa-invoice .row { position: absolute; left: 35px; width: 930px; height: 62px; display: grid; border-bottom: 1px solid var(--red-line); }
          .warsa-invoice .row>div { display: flex; align-items: center; border-right: 1px solid var(--red-line); padding-left: 16px; overflow: hidden; white-space: nowrap; }
          .warsa-invoice .row>div:last-child { border-right: none; }
          .warsa-invoice .row .ic { background: var(--red); border-right: 1px solid #fff; justify-content: center; padding: 0; }
          .warsa-invoice .row .ic svg { width: 34px; height: 34px; }
          .warsa-invoice .row .lbl { color: var(--red); font: 600 22px/1 'Oswald', sans-serif; letter-spacing: .2px; }
          .warsa-invoice .row .lbl.s { font: 600 21px/1 'Oswald', sans-serif; }
          .warsa-invoice .row .val { font: 600 22px/1 'Oswald', sans-serif; color: #222; letter-spacing: .3px; }
          .warsa-invoice .row .val.sm { font: 600 19px/1 'Oswald', sans-serif; }
          .warsa-invoice .row .inv-num-cell { font: 700 22px/1 'Oswald', sans-serif; color: #111; justify-content: center; padding: 0; letter-spacing: 1px; }
          .warsa-invoice .row .date { justify-content: center; padding: 0; font: 600 22px/1 'Barlow', sans-serif; color: #222; }
          .warsa-invoice .r1 { top: 322px; grid-template-columns: 67px 187px 288px 170px 218px; }
          .warsa-invoice .r2 { top: 384px; grid-template-columns: 67px 187px 288px 170px 218px; }
          .warsa-invoice .r3 { top: 446px; grid-template-columns: 67px 187px 288px 170px 218px; }
          .warsa-invoice .r4 { top: 508px; grid-template-columns: 67px 187px 288px 88px 153px 147px; border-bottom: 1px solid var(--red-line); }
          .warsa-invoice .r4 .lbl.own { padding-left: 12px; font-size: 19px; }
          .warsa-invoice .r4 .val { justify-content: center; padding: 0; font-size: 20px; }
          .warsa-invoice .credit-h { left: 965px; top: 322px; width: 156px; height: 62px; border-bottom: 1px solid var(--red-line); justify-content: center; font: 600 24px/1 'Oswald', sans-serif; color: #222; }
          .warsa-invoice .credit-v { left: 965px; top: 384px; width: 156px; height: 62px; justify-content: center; font: 700 29px/1 'Oswald', sans-serif; color: #000; }
          .warsa-invoice .side-phone { left: 1030px; top: 488px; width: 34px; height: 34px; }
          .warsa-invoice .side-num1 { left: 1024px; top: 540px; writing-mode: vertical-rl; font: 600 27px/1 'Oswald', sans-serif; letter-spacing: 1.5px; color: #222; }
          .warsa-invoice .side-line { left: 1011px; top: 750px; width: 69px; height: 1px; background: var(--red-line); }
          .warsa-invoice .side-wa { left: 1029px; top: 784px; width: 34px; height: 34px; }
          .warsa-invoice .side-num2 { left: 1024px; top: 828px; writing-mode: vertical-rl; font: 600 27px/1 'Oswald', sans-serif; letter-spacing: 1.5px; color: #222; white-space: nowrap; }
          .warsa-invoice .side-num2 small { font: 500 22px/1 'Oswald', sans-serif; letter-spacing: 1px; }
          .warsa-invoice .th { left: 35px; top: 588px; width: 925px; height: 52px; background: var(--red); display: grid; grid-template-columns: 177px 244px 166px 169px 169px; color: #fff; }
          .warsa-invoice .th div { display: flex; align-items: center; justify-content: center; font: 600 22px/1 'Oswald', sans-serif; letter-spacing: .4px; }
          .warsa-invoice .tr { position: absolute; left: 35px; width: 925px; display: grid; grid-template-columns: 177px 244px 166px 169px 169px; border-bottom: 1px solid var(--red-line); border-left: 1px solid var(--red-line); }
          .warsa-invoice .tr div { display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--red-line); font: 600 22px/1 'Oswald', sans-serif; color: #1c1c1c; }
          .warsa-invoice .tr div:last-child { border-right: 1px solid var(--red-line); }
          .warsa-invoice .tr.alt { background: var(--pink); }
          .warsa-invoice .tr em { font-style: italic; font-weight: 600; }
          .warsa-invoice .t1 { top: 640px; height: 52px; }
          .warsa-invoice .t2 { top: 692px; height: 52px; }
          .warsa-invoice .t3 { top: 744px; height: 52px; }
          .warsa-invoice .t4 { top: 796px; height: 52px; }
          .warsa-invoice .t5 { top: 848px; height: 52px; }
          .warsa-invoice .total-cases { left: 35px; top: 900px; width: 925px; height: 60px; display: grid; grid-template-columns: 421px 166px 338px; border: 1px solid var(--red-line); border-top: none; }
          .warsa-invoice .total-cases div { display: flex; align-items: center; justify-content: center; font: 600 22px/1 'Oswald', sans-serif; }
          .warsa-invoice .total-cases .tc-l { color: var(--red); font-size: 23px; border-right: 1px solid var(--red-line); }
          .warsa-invoice .sig-box { left: 35px; top: 960px; width: 570px; height: 208px; }
          .warsa-invoice .sig-label { left: 97px; top: 1048px; font: 600 20px/1 'Barlow', sans-serif; color: #111; }
          .warsa-invoice .sig-dots { left: 60px; top: 1132px; width: 236px; border-bottom: 2px dotted #222; height: 0; }
          .warsa-invoice .tot { left: 605px; width: 355px; display: grid; grid-template-columns: 193px 162px; border-left: 1px solid var(--red-line); }
          .warsa-invoice .tot div { display: flex; align-items: center; justify-content: center; font: 600 21px/1 'Oswald', sans-serif; }
          .warsa-invoice .tot .k { color: var(--red); border-right: 1px solid var(--red-line); border-bottom: 1px solid var(--red-line); font-size: 20px; }
          .warsa-invoice .tot .v { color: #222; border-bottom: 1px solid var(--red-line); font-size: 23px; }
          .warsa-invoice .tt1 { top: 960px; height: 63px; }
          .warsa-invoice .tt2 { top: 1023px; height: 67px; }
          .warsa-invoice .tt3 { top: 1090px; height: 78px; }
          .warsa-invoice .tot.tt3 .k { background: var(--red); color: #fff; border-right: none; border-bottom: none; font-size: 21px; }
          .warsa-invoice .tot.tt3 .v { background: #111; color: #fff; border-bottom: none; font: 600 38px/1 'Oswald', sans-serif; border-left: none; }
          .warsa-invoice .tot.tt3 { border-left: none; }
          .warsa-invoice .ty-line-l { left: 70px; top: 1201px; width: 238px; height: 1px; background: linear-gradient(90deg, rgba(221,0,0,0), var(--red)); }
          .warsa-invoice .ty-line-r { left: 823px; top: 1201px; width: 238px; height: 1px; background: linear-gradient(90deg, var(--red), rgba(221,0,0,0)); }
          .warsa-invoice .ty-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--red); top: 1197px; }
          .warsa-invoice .ty-text { left: 340px; width: 480px; top: 1178px; text-align: center; font: 400 34px/46px 'Kaushan Script', 'Brush Script MT', cursive; color: var(--red-dark); font-style: italic; }
          .warsa-invoice .footer { position: absolute; left: 0; top: 1230px; width: 1156px; height: 130px; background: var(--black); }
          .warsa-invoice .footer .redbg { position: absolute; inset: 0; background: var(--red); clip-path: polygon(940px 0, 1156px 0, 1156px 130px, 910px 130px); }
          .warsa-invoice .footer .whiteedge { position: absolute; inset: 0; background: #fff; clip-path: polygon(944px 0, 948px 0, 918px 130px, 914px 130px); }
          .warsa-invoice .f-pin { left: 55px; top: 1263px; width: 64px; height: 64px; border-radius: 50%; background: var(--red); }
          .warsa-invoice .f-pin svg { position: absolute; left: 18px; top: 14px; width: 28px; height: 36px; }
          .warsa-invoice .f-addr { left: 135px; top: 1276px; font: 600 18px/21px 'Barlow', sans-serif; color: #fff; }
          .warsa-invoice .f-div { left: 470px; top: 1263px; width: 1px; height: 64px; background: #666; }
          .warsa-invoice .f-phone-c { left: 505px; top: 1263px; width: 66px; height: 66px; border-radius: 50%; background: var(--red); }
          .warsa-invoice .f-phone-c svg { position: absolute; left: 18px; top: 18px; width: 30px; height: 30px; }
          .warsa-invoice .f-phone { left: 590px; top: 1281px; font: 600 23px/30px 'Barlow', sans-serif; color: #fff; }
          .warsa-invoice .code-bot { position: absolute; right: 20px; width: 200px; top: 1244px; text-align: center; color: #fff; font: 600 30px/1 'Oswald', sans-serif; letter-spacing: 1px; }
          .warsa-invoice .code-bot-n { position: absolute; right: 20px; width: 200px; top: 1276px; text-align: center; color: #fff; font-weight: 700; font-family: 'Oswald', sans-serif; white-space: nowrap; display: flex; align-items: center; justify-content: center; overflow: visible; }
          .perforation-divider {
            width: 1156px;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            background: #ffffff;
            border-top: 2px dashed #dd0000;
            border-bottom: 2px dashed #dd0000;
            margin: 6px 0;
          }
          .perforation-badge {
            background: #dd0000;
            color: #ffffff;
            padding: 4px 20px;
            border-radius: 9999px;
            font: 700 14px/1 'Oswald', sans-serif;
            letter-spacing: 2px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.12);
          }
        `}
      </style>

      <div className="warsa-print-container flex flex-col items-center">
        {/* Top: Original Copy */}
        <SingleInvoiceSheet isCustomerCopy={false} />

        {/* Center Perforation Cut-Line */}
        <div className="perforation-divider">
          <div className="perforation-badge">
            <Scissors className="w-4 h-4" />
            <span>✂ TEAR ALONG PERFORATION &bull; CUT LINE &bull; CUSTOMER COPY (BOTTOM)</span>
            <Scissors className="w-4 h-4 rotate-180" />
          </div>
        </div>

        {/* Bottom: Customer Copy */}
        <SingleInvoiceSheet isCustomerCopy={true} />
      </div>
    </div>
  );
};
