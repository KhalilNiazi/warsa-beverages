export type UserRole = 
  | 'SUPER_ADMIN'
  | 'UNASSIGNED'
  | 'ADMIN' 
  | 'ASM'
  | 'ORDER_BOOKER' 
  | 'SALESMAN'
  | 'DRIVER'
  | 'WAREHOUSE_MANAGER' 
  | 'ACCOUNTS' 
  | 'MANAGEMENT';

export type AppPageId = 
  | 'dashboard' 
  | 'dispatch' 
  | 'reconciliation' 
  | 'cashSlipBook'
  | 'inventory' 
  | 'sales' 
  | 'outlets' 
  | 'ledger' 
  | 'reports' 
  | 'settings' 
  | 'orderBookers';

export type ModulePermission = 'OFF' | 'READ' | 'WRITE';

export type ModulePermissions = Partial<Record<AppPageId, ModulePermission>>;

export interface AppUserProfile {
  id: string;
  name: string;
  username?: string; // Login username/handle
  passwordHash?: string; // PBKDF2-HMAC-SHA256 salted hash
  passwordSalt?: string; // Cryptographic 128-bit salt
  role: UserRole;
  roleTitle: string;
  department: string;
  description: string;
  responsibilities: string[];
  pinHash?: string; // PBKDF2-HMAC-SHA256 PIN hash
  pinSalt?: string; // Salt for PIN
  twoFactorEnabled?: boolean; // 2FA status
  twoFactorSecret?: string; // TOTP secret key
  avatarColor: string;
  iconName: string;
  assignedRoute?: string;
  assignedRoutes?: string[]; // Multiple routes assigned to this user
  vehicleNumber?: string;
  phone?: string;
  email?: string;
  allowedPages: AppPageId[];
  modulePermissions?: ModulePermissions;
  defaultPage: AppPageId;
  isCustom?: boolean;
  lastLoginAt?: string;
  passwordChangedAt?: string;
}

export type AppUserCredentialInput = {
  password?: string;
  pin?: string;
};

export interface InventoryItem {
  ID: string;
  Name: string;
  SKU: string;
  Size?: string;
  UnitType?: string;
  BottlesPerCase?: number;
  Quantity: number; // Current Live Floor Stock (available on floor)
  OpeningStock: number; // Opening stock for daily reconciliation
  StockAdded?: number; // Stock Inward today
  StockDispatched?: number; // Stock Dispatched today
  StockReturned?: number; // Stock Returned from routes today
  StockDamaged?: number; // Stock Damaged/Spoiled
  InTransitQuantity?: number; // Stock currently out on dispatch/vehicles
  Price: number;
  MinThreshold: number;
  LastUpdated?: string;
}

export interface StockInwardRecord {
  ID: string;
  Date: string;
  SupplierSource: string;
  ProductID: string;
  ProductName: string;
  Quantity: number;
  Unit: string;
  BatchNumber?: string;
  ReferenceNumber?: string;
  Remarks?: string;
  ReceivedBy: string;
  CreatedAt: string;
}

export type StockMovementType = 
  | 'STOCK_IN' 
  | 'LOAD_OUT' 
  | 'DISPATCH' 
  | 'DELIVERY' 
  | 'RETURN' 
  | 'RESTOCK' 
  | 'ADJUSTMENT' 
  | 'DAMAGE' 
  | 'LOSS';

export interface StockMovementRecord {
  ID: string;
  Date: string;
  ProductID: string;
  ProductName: string;
  Type: StockMovementType;
  Quantity: number;
  From: string;
  To: string;
  User: string;
  ReferenceID?: string;
  Notes?: string;
  CreatedAt: string;
}

export type RejectionReason = 
  | 'Shop Closed'
  | 'Owner Not Available'
  | 'Cash / Payment Issue'
  | 'Order Cancelled'
  | 'Customer Refused'
  | 'Stock Already Available'
  | 'Damaged Product'
  | 'Wrong Order'
  | 'Delivery Delay'
  | 'Other';

export interface InvoiceItem {
  ProductID: string;
  ProductName: string;
  BookedQty?: number; // Requested by customer
  LoadedQty?: number; // Loaded onto vehicle
  DeliveredQty?: number; // Actually accepted by outlet
  RejectedQty?: number; // Refused / returned by outlet
  Quantity: number; // Backward compatibility (booked quantity)
  Price: number;
  Amount?: number;
  Total?: number; // Backward compatibility for line total
  RejectionReason?: RejectionReason | string;
  RejectionNotes?: string;
  IsPromo?: boolean;
  PromoScheme?: string;
}

export type DeliveryStatus = 'BOOKED' | 'PENDING' | 'LOADED' | 'DISPATCHED' | 'DELIVERED' | 'PARTIAL' | 'REJECTED' | 'CANCELLED';

export interface SaleRecord {
  ID: string; 
  Date: string;
  OutletID?: string;
  OutletSrNo?: number;
  OutletCode?: string;
  OutletName: string;
  Route: string;
  Address: string;
  ContactNumber: string;
  OwnerName?: string;
  OrderBooker?: string;
  BookedBy?: string; 
  Status?: string;
  DeliveryStatus?: DeliveryStatus;
  RejectionReason?: RejectionReason | string;
  RejectionNotes?: string;
  LoadID?: string;
  VehicleNumber?: string;
  DriverName?: string;
  Items: InvoiceItem[];
  TotalCases: number; // Booked cases
  LoadedCases?: number; // Actually loaded cases
  DeliveredCases?: number; // Actual accepted cases
  RejectedCases?: number; // Returned / Not accepted cases
  TotalAmount: number; // Booked amount
  ActualAmount?: number; // Actual accepted amount
  Discount: number;
  Tax?: number;
  GrandTotal: number; // Booked grand total
  ActualGrandTotal?: number; // Actual delivered grand total
  PaymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID';
  CashCollected?: number;
  CreditAmount?: number;
  PaymentMethod?: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Other';
  HasPromo?: boolean;
  PromoDescription?: string;
  PromoFreeCases?: number;
  PromoProductID?: string;
  PromoProductName?: string;
  CreatedAt?: string;
}

export interface DispatchLoadItem {
  ProductID: string;
  ProductName: string;
  BookedQty: number;
  LoadedQty: number;
  ShortQty?: number;
  ExtraQty?: number;
  DeliveredQty: number;
  ReturnedQty: number;
  DamagedQty?: number;
  RestockedQty?: number;
  DispatchedQty?: number; // Backward compatibility
}

export type DispatchStatus = 'DRAFT' | 'LOADED' | 'DISPATCHED' | 'RETURNING' | 'RECONCILED' | 'COMPLETED' | 'CLOSED';

export interface DispatchLoad {
  ID: string;
  LoadNumber: string;
  Date: string;
  Route: string;
  DriverOrOB: string;
  DriverName?: string;
  OrderBooker?: string;
  VehicleNumber: string;
  DepartureTime?: string;
  ReturnTime?: string;
  Status: DispatchStatus;
  SaleIDs: string[];
  Items: DispatchLoadItem[];
  TotalBookedCases: number;
  TotalLoadedCases: number;
  TotalDispatchedCases: number;
  TotalDeliveredCases: number;
  TotalReturnedCases: number;
  TotalDamagedCases?: number;
  TotalRestockedCases?: number;
  RemainingVehicleCases?: number;
  RestockedToFloor: boolean;
  CashCollected?: number;
  CreditSales?: number;
  Notes?: string;
  CreatedAt: string;
  ReconciledAt?: string;
  ClosedAt?: string;
}

export interface Outlet {
  ID: string;
  SrNo?: number;
  Code: string;
  Name: string;
  Route: string;
  Area?: string;
  Address: string;
  ContactNumber: string;
  OwnerName: string;
  OB: string;
  OrderBookerID?: string;
  DeliveryManName?: string;
  CustomerType?: 'Retailer' | 'Wholesaler' | 'Corporate' | 'Distributor';
  Status: 'Active' | 'Inactive' | 'Temporarily Closed';
  CustomRates: Record<string, number>;
  OpeningBalance: number;
  CreditLimit?: number;
  CreatedAt?: string;
}

export interface RouteRecord {
  ID: string;
  Name: string;
  Area: string;
  AssignedOB?: string;
  AssignedDriver?: string;
  VehicleNumber?: string;
  TotalOutlets?: number;
  Notes?: string;
}

export interface PaymentRecord {
  ID: string;
  Date: string;
  OutletID: string;
  OutletName?: string;
  OutletCode?: string;
  InvoiceID?: string;
  Amount: number;
  PaymentMethod: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Other';
  ReferenceNumber?: string;
  CollectedBy: string;
  Notes: string;
  Type?: 'RECEIPT' | 'RETURN';
  CreatedAt?: string;
}

export interface OrderBooker {
  ID: string;
  Name: string;
  Phone?: string;
  AssignedRoutes?: string[];
}

export interface DeliveryMan {
  ID: string;
  Name: string;
}

export interface ReturnInspectionRecord {
  ID: string;
  Date: string;
  DispatchID: string;
  SaleID?: string;
  OutletName?: string;
  ProductID: string;
  ProductName: string;
  Quantity: number;
  Condition: 'GOOD_RESTOCKED' | 'DAMAGED' | 'PENDING';
  Reason: string;
  InspectedBy: string;
  Notes?: string;
  CreatedAt: string;
}

export interface DailyClosingRecord {
  ID: string;
  Date: string;
  OpeningFloorStock: number;
  StockAdded: number;
  DispatchedStock: number;
  DeliveredStock: number;
  ReturnedStock: number;
  DamagedStock: number;
  VehicleRemainingStock: number;
  RestockedStock: number;
  ClosingFloorStock: number;
  ActualSalesCases: number;
  TotalBookedRevenue: number;
  TotalActualRevenue: number;
  CashReceived: number;
  CreditSales: number;
  CustomerPayments: number;
  OutstandingBalances: number;
  Status: 'RECONCILED' | 'MISMATCH';
  MismatchNotes?: string;
  ClosedBy: string;
  ClosedAt: string;
}

export interface ReconciliationSummary {
  date: string;
  openingFloorStock: { productId: string; productName: string; qty: number }[];
  totalOpeningCases: number;
  stockAddedToday: { productId: string; productName: string; qty: number }[];
  totalStockAddedCases: number;
  dispatchedStock: { productId: string; productName: string; qty: number }[];
  totalDispatchedCases: number;
  outletIntake: {
    outletName: string;
    outletCode: string;
    route: string;
    saleId: string;
    bookedCases: number;
    loadedCases: number;
    deliveredCases: number;
    rejectedCases: number;
    deliveryStatus: DeliveryStatus;
    rejectionReason?: string;
    rejectionNotes?: string;
    actualAmount: number;
    bookedAmount: number;
  }[];
  totalReceivedCases: number;
  rejectedAndReturned: {
    outletName: string;
    outletCode: string;
    saleId: string;
    productId: string;
    productName: string;
    rejectedQty: number;
    reason: string;
    notes?: string;
    condition?: 'GOOD_RESTOCKED' | 'DAMAGED' | 'PENDING';
  }[];
  totalRejectedCases: number;
  totalDamagedCases: number;
  totalRestockedCases: number;
  vehicleRemainingStock: { productId: string; productName: string; qty: number }[];
  totalVehicleRemainingCases: number;
  remainingFloorStock: {
    productId: string;
    productName: string;
    openingQty: number;
    addedQty: number;
    dispatchedQty: number;
    returnedRestockedQty: number;
    currentFloorQty: number;
  }[];
  totalRemainingFloorCases: number;
  reconciliationStatus: 'RECONCILED' | 'MISMATCH';
  reconciliationDifference: number;
  actualDailySales: {
    totalBookedCases: number;
    totalLoadedCases: number;
    totalDeliveredCases: number;
    totalRejectedCases: number;
    totalBookedRevenue: number;
    totalActualRevenue: number;
    totalLostOrReturnedRevenue: number;
    totalCashCollected: number;
    totalCreditAmount: number;
  };
}

export interface Settings {
  appsScriptUrl: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  invoiceButtonLabel?: string;
  defaultPromoProductID?: string;
}

export type GoogleSheetSyncState = 'IDLE' | 'SAVING' | 'SAVED' | 'QUEUED' | 'OFFLINE' | 'ERROR';

export interface SyncLogEntry {
  id: string;
  action: string;
  targetId?: string;
  status: 'SAVING' | 'SAVED' | 'FAILED' | 'QUEUED';
  timestamp: string;
  error?: string;
}

export interface GoogleSheetSyncRuntimeStatus {
  state: GoogleSheetSyncState;
  lastAction?: string;
  lastTargetId?: string;
  lastSyncTime?: string;
  lastError?: string;
  pendingCount: number;
  inFlightCount: number;
  sheetName?: string;
  sheetId?: string;
  isOnline: boolean;
  recentLogs: SyncLogEntry[];
}

export interface AuditLog {
  ID: string;
  Date: string;
  User: string;
  Role: UserRole;
  Action: string;
  Entity: string;
  Details: string;
}

export interface CashDenomination {
  note5000: number; // 5000 Rs notes count
  note1000: number; // 1000 Rs notes count
  note500: number;  // 500 Rs notes count
  note100: number;  // 100 Rs notes count
  note50: number;   // 50 Rs notes count
  note20: number;   // 20 Rs notes count
  note10: number;   // 10 Rs notes count
  coins: number;    // Coins / loose change total in Rs
}

export interface CashSlipExpense {
  id: string;
  category: 'fuel' | 'vehicle_repair' | 'personal_food' | 'other';
  title: string;
  amount: number;
  receiptNumber?: string;
  notes?: string;
}

export interface CashSlipRecord {
  id: string;
  slipNumber: string; // e.g. CS-20260916-001
  date: string;       // YYYY-MM-DD
  salesmanId?: string;
  salesmanName: string;
  route: string;
  vehicleType?: 'Bike' | 'Rickshaw' | 'Suzuki' | 'Van' | 'Other';
  vehicleNumber?: string;

  // Currency notes denomination breakdown
  denominations: CashDenomination;
  totalPhysicalCash: number; // 5000*c + 1000*c + 500*c + 100*c + 50*c + 20*c + 10*c + coins

  // Route expenses deducted from daily collection
  fuelExpense: number;        // Fuel / Petrol expense
  vehicleExpense: number;     // Bike/Rickshaw repair & maintenance
  personalExpense: number;    // Personal use, lunch, tea, food
  otherExpense: number;       // Other route expense
  expenseDetails?: CashSlipExpense[];
  totalExpenses: number;      // Total expenses deducted

  // Total accounted by salesman
  totalAccountedCash: number; // totalPhysicalCash + totalExpenses

  // System Daily Sales Report Comparison
  expectedSalesCash: number;  // Expected cash from Daily Sales Report for that date/route
  creditSales?: number;       // Credit / Udhar sales on that day
  totalDeliveredSales?: number; // Total delivered value
  totalInvoicesCount?: number;

  // Difference calculation
  difference: number;         // totalAccountedCash - expectedSalesCash
  matchStatus: 'EXACT_MATCH' | 'SHORTAGE' | 'EXCESS'; // No difference | Shortage (کمی) | Excess (بیشی)

  notes?: string;
  submittedBy?: string;
  receivedBy?: string;        // Cashier / Accountant name
  verifiedBy?: string;        // Manager / Owner name
  status: 'DRAFT' | 'VERIFIED' | 'APPROVED';
  createdAt: string;
  updatedAt?: string;
}
