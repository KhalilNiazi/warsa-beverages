# Warsa Water Tracker - KFM Beverages

KFM Beverages (WARSA) - Complete Water Beverage Distribution, Warehouse, Dispatch, Sales, Customer Ledgers and 8-Point Reconciliation System.

## Core Modules & Features

## Secure configuration and deployment

- Copy `.env.example` to `.env` locally and provide environment-specific values. Never
  distribute `.env` or credentials.
- Configure the server-only `GOOGLE_APPS_SCRIPT_URL` with the HTTPS deployment URL
  for the canonical `google-apps-script/Code.gs`. The server proxies authenticated
  operations by POST only.
- In Apps Script, set the `SPREADSHEET_ID` Script Property under Project Settings.
- Firebase users must be provisioned by an administrator. Public registration is
  disabled; application roles must be assigned through trusted Firebase custom
  claims. Users without a valid role have no application access.
- Before deploying Apps Script, set the `FIREBASE_ROLE_REGISTRY` Script Property to
  a JSON object keyed by verified Firebase UID, for example
  `{"firebase-uid":"ORDER_BOOKER"}`. Do not use email text as an authorization rule.
- Deploy the Apps Script web app to execute as the owner, but require Firebase ID
  tokens for every operation except the non-sensitive health ping. `setup` is an
  authenticated POST operation; there is no editor-console or unauthenticated
  bootstrap bypass.
- Firestore rules are deny-by-default. Test them in the Firebase Emulator before
  publishing, and do not grant ordinary users access to credential fields or
  administrative collections.

- **Warehouse Stock (`/inventory`)**: Master inventory catalog (500ml, 1.5L, 6L, 19L), stock inward logs, physical floor stock counts, and threshold alerts.
- **Deliveries & Dispatch (`/dispatch`)**: Vehicle loading, delivery fulfillment, returned empty bottles, and route load reconciliation.
- **Booked Orders (`/sales`)**: Order booking, delivery verification, item rejection logging, and invoice generation.
- **Customer Ledgers & Cash (`/ledger`)**: Shop-by-shop credit ledgers, payment collection records, and statement printing.
- **Daily Closing & Math Check (`/reconciliation`)**: 8-point verification between morning stock, loaded cases, shop drops, returned bottles, live floor stock, and cash settlement.
- **Cash Slip Book (`/cashSlipBook`)**: Physical cash denomination logging, expense vouchers, and cashier settlements.
- **Shops & Outlets (`/outlets`)**: Retailer registry, route mapping, GPS coordinates, and custom bottle rates.
- **Order Bookers (`/orderBookers`)**: Sales rep performance, route assignments, and daily booking summaries.
- **Real-Time Cloud Sync**: Bidirectional synchronization with Google Sheets backend and Firebase Firestore.
"# warsa-beverages" 
