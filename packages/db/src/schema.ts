import { pgTable, uuid, text, boolean, integer, numeric, timestamp, date, pgEnum, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roleEnum = pgEnum("user_role", ["owner", "manager", "cashier", "waiter", "chef", "store"]);
export const orderTypeEnum = pgEnum("order_type", ["dine_in", "takeaway", "delivery"]);
export const orderStatusEnum = pgEnum("order_status", ["open", "billed", "cancelled"]);
export const itemStatusEnum = pgEnum("item_status", ["pending", "preparing", "ready", "served", "cancelled"]);
export const kotStatusEnum = pgEnum("kot_status", ["pending", "preparing", "ready", "served"]);
export const tableStatusEnum = pgEnum("table_status", ["free", "occupied", "reserved"]);
export const unitEnum = pgEnum("stock_unit", ["kg", "g", "l", "ml", "pcs"]);
export const ledgerReasonEnum = pgEnum("ledger_reason", ["opening", "purchase", "sale", "wastage", "adjustment"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "upi", "card", "other"]);
export const billStatusEnum = pgEnum("bill_status", ["unpaid", "paid", "void"]);

const money = (name: string) => numeric(name, { precision: 12, scale: 2 }).notNull().default("0");
const qty = (name: string) => numeric(name, { precision: 12, scale: 3 }).notNull().default("0");
const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const restaurants = pgTable("restaurants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  gstin: text("gstin"),
  address: text("address"),
  phone: text("phone"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("5"),
  serviceChargePct: numeric("service_charge_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  plan: text("plan").notNull().default("trial"),
  createdAt: created(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // = auth.users.id
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email"),
  role: roleEnum("role").notNull().default("waiter"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
}, (t) => [index("profiles_restaurant_idx").on(t.restaurantId)]);

export const invites = pgTable("invites", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  role: roleEnum("role").notNull(),
  usedBy: uuid("used_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});

export const counters = pgTable("counters", {
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  value: integer("value").notNull().default(0),
}, (t) => [uniqueIndex("counters_pk").on(t.restaurantId, t.kind)]);

export const categories = pgTable("categories", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const ingredients = pgTable("ingredients", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  unit: unitEnum("unit").notNull().default("kg"),
  currentStock: qty("current_stock"),
  reorderLevel: qty("reorder_level"),
  costPerUnit: money("cost_per_unit"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
}, (t) => [index("ingredients_restaurant_idx").on(t.restaurantId)]);

export const menuItems = pgTable("menu_items", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  price: money("price"),
  isVeg: boolean("is_veg").notNull().default(true),
  isAvailable: boolean("is_available").notNull().default(true),
  prepMinutes: integer("prep_minutes").notNull().default(15),
  imageUrl: text("image_url"),
  createdAt: created(),
}, (t) => [index("menu_items_restaurant_idx").on(t.restaurantId)]);

export const recipeItems = pgTable("recipe_items", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  menuItemId: uuid("menu_item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  qty: qty("qty"),
}, (t) => [uniqueIndex("recipe_unique").on(t.menuItemId, t.ingredientId)]);

export const stockLedger = pgTable("stock_ledger", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  qty: qty("qty"), // + in, − out
  reason: ledgerReasonEnum("reason").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  note: text("note"),
  createdBy: uuid("created_by"),
  createdAt: created(),
}, (t) => [index("ledger_ing_idx").on(t.ingredientId, t.createdAt)]);

export const purchases = pgTable("purchases", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  supplier: text("supplier"),
  invoiceNo: text("invoice_no"),
  total: money("total"),
  purchasedAt: date("purchased_at").notNull().defaultNow(),
  createdBy: uuid("created_by"),
  createdAt: created(),
});

export const purchaseItems = pgTable("purchase_items", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull(),
  purchaseId: uuid("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id),
  qty: qty("qty"),
  unitCost: money("unit_cost"),
});

export const diningTables = pgTable("dining_tables", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(4),
  zone: text("zone").notNull().default("Main"),
  status: tableStatusEnum("status").notNull().default("free"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const orders = pgTable("orders", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  orderNo: integer("order_no").notNull(),
  type: orderTypeEnum("type").notNull().default("dine_in"),
  tableId: uuid("table_id").references(() => diningTables.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  status: orderStatusEnum("status").notNull().default("open"),
  notes: text("notes"),
  createdBy: uuid("created_by"),
  createdAt: created(),
}, (t) => [index("orders_restaurant_status_idx").on(t.restaurantId, t.status, t.createdAt)]);

export const kots = pgTable("kots", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  kotNo: integer("kot_no").notNull(),
  status: kotStatusEnum("status").notNull().default("pending"),
  createdAt: created(),
  readyAt: timestamp("ready_at", { withTimezone: true }),
}, (t) => [index("kots_restaurant_status_idx").on(t.restaurantId, t.status)]);

export const orderItems = pgTable("order_items", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  kotId: uuid("kot_id").references(() => kots.id, { onDelete: "set null" }),
  menuItemId: uuid("menu_item_id").references(() => menuItems.id, { onDelete: "set null" }),
  nameSnapshot: text("name_snapshot").notNull(),
  priceSnapshot: money("price_snapshot"),
  qty: integer("qty").notNull().default(1),
  status: itemStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: created(),
}, (t) => [index("order_items_order_idx").on(t.orderId)]);

export const bills = pgTable("bills", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  billNo: integer("bill_no").notNull(),
  subtotal: money("subtotal"),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  discountAmount: money("discount_amount"),
  serviceCharge: money("service_charge"),
  cgst: money("cgst"),
  sgst: money("sgst"),
  roundOff: money("round_off"),
  total: money("total"),
  status: billStatusEnum("status").notNull().default("unpaid"),
  createdBy: uuid("created_by"),
  createdAt: created(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (t) => [index("bills_restaurant_created_idx").on(t.restaurantId, t.createdAt)]);

export const payments = pgTable("payments", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  method: paymentMethodEnum("method").notNull(),
  amount: money("amount"),
  ref: text("ref"),
  createdAt: created(),
});

export const dayCloses = pgTable("day_closes", {
  id: id(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  businessDate: date("business_date").notNull(),
  ordersCount: integer("orders_count").notNull().default(0),
  totalSales: money("total_sales"),
  cash: money("cash"),
  upi: money("upi"),
  card: money("card"),
  other: money("other"),
  notes: text("notes"),
  closedBy: uuid("closed_by"),
  closedAt: created(),
}, (t) => [uniqueIndex("day_close_unique").on(t.restaurantId, t.businessDate)]);

// ── v2: hospitality ───────────────────────────────────────────────────────
export const propertyTypeEnum = pgEnum("property_type", ["restaurant", "hotel", "resort"]);
export const membershipEnum = pgEnum("membership_status", ["trial", "active", "expired", "suspended"]);
export const roomStatusEnum = pgEnum("room_status", ["available", "occupied", "reserved", "cleaning", "maintenance"]);
export const bookingStatusEnum = pgEnum("booking_status", ["reserved", "checked_in", "checked_out", "cancelled", "no_show"]);
export const chargeKindEnum = pgEnum("charge_kind", ["room", "restaurant", "facility", "extra", "discount", "tax"]);

export const roomTypes = pgTable("room_types", {
  id: id(), restaurantId: uuid("restaurant_id").notNull(), name: text("name").notNull(), baseRate: money("base_rate"), capacity: integer("capacity").notNull().default(2), isActive: boolean("is_active").notNull().default(true),
});
export const rooms = pgTable("rooms", {
  id: id(), restaurantId: uuid("restaurant_id").notNull(), number: text("number").notNull(), floor: integer("floor").notNull().default(1), roomTypeId: uuid("room_type_id"), status: roomStatusEnum("status").notNull().default("available"), notes: text("notes"), sortOrder: integer("sort_order").notNull().default(0),
});
export const guests = pgTable("guests", {
  id: id(), restaurantId: uuid("restaurant_id").notNull(), fullName: text("full_name").notNull(), phone: text("phone"), email: text("email"), idType: text("id_type"), idLast4: text("id_last4"), address: text("address"), notes: text("notes"), visits: integer("visits").notNull().default(0), createdAt: created(),
});
export const bookings = pgTable("bookings", {
  id: id(), restaurantId: uuid("restaurant_id").notNull(), bookingNo: integer("booking_no").notNull(), guestId: uuid("guest_id").notNull(), roomId: uuid("room_id").notNull(), checkIn: date("check_in").notNull(), checkOut: date("check_out").notNull(), adults: integer("adults").notNull().default(2), children: integer("children").notNull().default(0), rate: money("rate"), status: bookingStatusEnum("status").notNull().default("reserved"), source: text("source"), advance: money("advance"), checkedInAt: timestamp("checked_in_at", { withTimezone: true }), checkedOutAt: timestamp("checked_out_at", { withTimezone: true }), notes: text("notes"), createdBy: uuid("created_by"), createdAt: created(),
});
export const bookingCharges = pgTable("booking_charges", {
  id: id(), restaurantId: uuid("restaurant_id").notNull(), bookingId: uuid("booking_id").notNull(), kind: chargeKindEnum("kind").notNull(), description: text("description").notNull(), amount: money("amount"), refType: text("ref_type"), refId: uuid("ref_id"), createdBy: uuid("created_by"), createdAt: created(),
});
export const housekeepingTasks = pgTable("housekeeping_tasks", {
  id: id(), restaurantId: uuid("restaurant_id").notNull(), roomId: uuid("room_id").notNull(), kind: text("kind").notNull().default("clean"), status: text("status").notNull().default("pending"), assignedTo: uuid("assigned_to"), notes: text("notes"), createdAt: created(), doneAt: timestamp("done_at", { withTimezone: true }),
});
export const facilities = pgTable("facilities", {
  id: id(), restaurantId: uuid("restaurant_id").notNull(), name: text("name").notNull(), kind: text("kind").notNull().default("activity"), rate: money("rate"), durationMinutes: integer("duration_minutes").notNull().default(60), capacity: integer("capacity").notNull().default(1), isActive: boolean("is_active").notNull().default(true),
});
export const facilityBookings = pgTable("facility_bookings", {
  id: id(), restaurantId: uuid("restaurant_id").notNull(), facilityId: uuid("facility_id").notNull(), bookingId: uuid("booking_id"), guestName: text("guest_name"), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), people: integer("people").notNull().default(1), amount: money("amount"), status: text("status").notNull().default("booked"), createdBy: uuid("created_by"), createdAt: created(),
});
export const platformAdmins = pgTable("platform_admins", { userId: uuid("user_id").primaryKey(), label: text("label"), createdAt: created() });
export const membershipKeys = pgTable("membership_keys", { code: text("code").primaryKey(), plan: text("plan").notNull(), days: integer("days").notNull(), restaurantId: uuid("restaurant_id"), redeemedBy: uuid("redeemed_by"), redeemedAt: timestamp("redeemed_at", { withTimezone: true }), createdBy: uuid("created_by"), createdAt: created() });


// ── v3: scan, labour, invoices ────────────────────────────────────────────
export const scanLog = pgTable("scan_log", { id: id(), restaurantId: uuid("restaurant_id").notNull(), source: text("source").notNull(), kind: text("kind"), code: text("code"), result: jsonb("result"), action: text("action"), targetId: uuid("target_id"), createdBy: uuid("created_by"), createdAt: created() });
export const labourers = pgTable("labourers", { id: id(), restaurantId: uuid("restaurant_id").notNull(), code: text("code").notNull(), fullName: text("full_name").notNull(), phone: text("phone"), skill: text("skill"), dailyWage: money("daily_wage"), idType: text("id_type"), idLast4: text("id_last4"), address: text("address"), emergencyContact: text("emergency_contact"), notes: text("notes"), joinedOn: date("joined_on"), status: text("status").notNull().default("active"), createdAt: created() });
export const labourAttendance = pgTable("labour_attendance", { id: id(), restaurantId: uuid("restaurant_id").notNull(), labourerId: uuid("labourer_id").notNull(), workDate: date("work_date").notNull(), inAt: timestamp("in_at", { withTimezone: true }), outAt: timestamp("out_at", { withTimezone: true }), hours: numeric("hours", { precision: 5, scale: 2 }), wage: money("wage"), note: text("note"), createdBy: uuid("created_by") });
export const labourPayments = pgTable("labour_payments", { id: id(), restaurantId: uuid("restaurant_id").notNull(), labourerId: uuid("labourer_id").notNull(), amount: money("amount"), method: text("method").notNull().default("cash"), periodFrom: date("period_from"), periodTo: date("period_to"), note: text("note"), createdBy: uuid("created_by"), createdAt: created() });
export const invoices = pgTable("invoices", { id: id(), restaurantId: uuid("restaurant_id").notNull(), invoiceNo: integer("invoice_no").notNull(), kind: text("kind").notNull(), bookingId: uuid("booking_id"), billId: uuid("bill_id"), guestName: text("guest_name"), guestPhone: text("guest_phone"), guestGstin: text("guest_gstin"), lines: jsonb("lines").notNull().default("[]"), subtotal: money("subtotal"), discount: money("discount"), cgst: money("cgst"), sgst: money("sgst"), roundOff: money("round_off"), total: money("total"), paid: money("paid"), payments: jsonb("payments").notNull().default("[]"), status: text("status").notNull().default("paid"), issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(), createdBy: uuid("created_by") });

// ── v4: printing, delivery channels, OTA channel manager ──────────────────
export const printers = pgTable("printers", { id: id(), restaurantId: uuid("restaurant_id").notNull(), name: text("name").notNull(), kind: text("kind").notNull().default("bill"), transport: text("transport").notNull().default("browser"), width: integer("width").notNull().default(80), address: text("address"), station: text("station"), copies: integer("copies").notNull().default(1), cut: boolean("cut").notNull().default(true), drawer: boolean("drawer").notNull().default(false), header: text("header"), footer: text("footer"), isDefault: boolean("is_default").notNull().default(false), isActive: boolean("is_active").notNull().default(true), createdAt: created() });
export const printJobs = pgTable("print_jobs", { id: id(), restaurantId: uuid("restaurant_id").notNull(), printerId: uuid("printer_id"), kind: text("kind").notNull(), refType: text("ref_type"), refId: uuid("ref_id"), payload: jsonb("payload").notNull().default("{}"), status: text("status").notNull().default("queued"), error: text("error"), attempts: integer("attempts").notNull().default(0), createdAt: created(), printedAt: timestamp("printed_at", { withTimezone: true }) });
export const orderChannels = pgTable("order_channels", { id: id(), restaurantId: uuid("restaurant_id").notNull(), kind: text("kind").notNull(), label: text("label").notNull(), outletRef: text("outlet_ref"), webhookToken: text("webhook_token").notNull(), apiBase: text("api_base"), apiKey: text("api_key"), autoAccept: boolean("auto_accept").notNull().default(false), prepMinutes: integer("prep_minutes").notNull().default(20), commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("0"), isLive: boolean("is_live").notNull().default(false), lastSyncAt: timestamp("last_sync_at", { withTimezone: true }), createdAt: created() });
export const onlineOrders = pgTable("online_orders", { id: id(), restaurantId: uuid("restaurant_id").notNull(), channelId: uuid("channel_id"), externalId: text("external_id").notNull(), displayId: text("display_id"), status: text("status").notNull().default("new"), customerName: text("customer_name"), customerPhone: text("customer_phone"), address: text("address"), items: jsonb("items").notNull().default("[]"), unmatched: jsonb("unmatched").notNull().default("[]"), gross: money("gross"), commission: money("commission"), payout: money("payout"), isPrepaid: boolean("is_prepaid").notNull().default(true), orderId: uuid("order_id"), raw: jsonb("raw"), placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(), createdAt: created() });
export const otaChannels = pgTable("ota_channels", { id: id(), restaurantId: uuid("restaurant_id").notNull(), kind: text("kind").notNull(), label: text("label").notNull(), mode: text("mode").notNull().default("ical"), roomTypeId: uuid("room_type_id"), roomId: uuid("room_id"), importUrl: text("import_url"), exportToken: text("export_token").notNull(), apiBase: text("api_base"), apiKey: text("api_key"), hotelRef: text("hotel_ref"), commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("15"), rateOffsetPct: numeric("rate_offset_pct", { precision: 5, scale: 2 }).notNull().default("0"), pushRates: boolean("push_rates").notNull().default(true), pushInventory: boolean("push_inventory").notNull().default(true), isLive: boolean("is_live").notNull().default(false), lastImportAt: timestamp("last_import_at", { withTimezone: true }), lastPushAt: timestamp("last_push_at", { withTimezone: true }), lastError: text("last_error"), createdAt: created() });
export const otaSyncLog = pgTable("ota_sync_log", { id: id(), restaurantId: uuid("restaurant_id").notNull(), channelId: uuid("channel_id"), direction: text("direction").notNull(), ok: boolean("ok").notNull().default(true), message: text("message"), count: integer("count"), createdAt: created() });
export const rateInventory = pgTable("rate_inventory", { restaurantId: uuid("restaurant_id").notNull(), roomTypeId: uuid("room_type_id").notNull(), stayDate: date("stay_date").notNull(), rate: money("rate"), openRooms: integer("open_rooms"), stopSell: boolean("stop_sell").notNull().default(false), minNights: integer("min_nights").notNull().default(1), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() });

// ── v6: the Tomorrow brief ────────────────────────────────────────────────
export const forecastRuns = pgTable("forecast_runs", { id: id(), restaurantId: uuid("restaurant_id").notNull(), forDate: date("for_date").notNull(), generatedAt: created(), predictedCovers: integer("predicted_covers").notNull().default(0), lowCovers: integer("low_covers").notNull().default(0), highCovers: integer("high_covers").notNull().default(0), confidence: numeric("confidence", { precision: 4, scale: 2 }).notNull().default("0"), basis: text("basis"), inHouse: integer("in_house").notNull().default(0), arrivals: integer("arrivals").notNull().default(0), departures: integer("departures").notNull().default(0), drivers: jsonb("drivers").notNull().default("[]"), dishes: jsonb("dishes").notNull().default("[]"), purchase: jsonb("purchase").notNull().default("[]"), estPurchaseCost: money("est_purchase_cost"), actualCovers: integer("actual_covers"), actualSales: money("actual_sales"), gradedAt: timestamp("graded_at", { withTimezone: true }), chefNotes: jsonb("chef_notes").notNull().default("{}") });

// ── v7: Neighbours network ────────────────────────────────────────────────
export const networkSettings = pgTable("network_settings", { restaurantId: uuid("restaurant_id").primaryKey(), sharePrices: boolean("share_prices").notNull().default(false), shareSurplus: boolean("share_surplus").notNull().default(false), shareLabour: boolean("share_labour").notNull().default(false), shareDemand: boolean("share_demand").notNull().default(false), radiusKm: integer("radius_km").notNull().default(40), joinedAt: timestamp("joined_at", { withTimezone: true }), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() });
export const surplusListings = pgTable("surplus_listings", { id: id(), restaurantId: uuid("restaurant_id").notNull(), ingredientId: uuid("ingredient_id"), item: text("item").notNull(), qty: numeric("qty", { precision: 12, scale: 3 }).notNull(), unit: text("unit").notNull(), bestBefore: date("best_before"), price: money("price"), note: text("note"), status: text("status").notNull().default("open"), claimedBy: uuid("claimed_by"), claimedAt: timestamp("claimed_at", { withTimezone: true }), createdBy: uuid("created_by"), createdAt: created() });
export const labourStandby = pgTable("labour_standby", { id: id(), restaurantId: uuid("restaurant_id").notNull(), labourerId: uuid("labourer_id").notNull(), forDate: date("for_date").notNull(), fromTime: text("from_time"), toTime: text("to_time"), note: text("note"), status: text("status").notNull().default("open"), bookedBy: uuid("booked_by"), bookedAt: timestamp("booked_at", { withTimezone: true }), createdAt: created() });

// ── v8: Proof of Business ─────────────────────────────────────────────────
export const businessPeriods = pgTable("business_periods", { id: id(), restaurantId: uuid("restaurant_id").notNull(), period: date("period").notNull(), roomsRevenue: money("rooms_revenue"), diningRevenue: money("dining_revenue"), deliveryRevenue: money("delivery_revenue"), totalRevenue: money("total_revenue"), gstCollected: money("gst_collected"), supplierPaid: money("supplier_paid"), wagesPaid: money("wages_paid"), covers: integer("covers").notNull().default(0), invoicesIssued: integer("invoices_issued").notNull().default(0), roomNightsSold: integer("room_nights_sold").notNull().default(0), roomNightsAvailable: integer("room_nights_available").notNull().default(0), occupancyPct: numeric("occupancy_pct", { precision: 5, scale: 2 }), avgTicket: money("avg_ticket"), daysTraded: integer("days_traded").notNull().default(0), prevHash: text("prev_hash"), hash: text("hash").notNull(), sealedAt: created() });
export const proofLinks = pgTable("proof_links", { id: id(), restaurantId: uuid("restaurant_id").notNull(), token: text("token").notNull(), label: text("label").notNull(), purpose: text("purpose").notNull(), fromPeriod: date("from_period").notNull(), toPeriod: date("to_period").notNull(), showCosts: boolean("show_costs").notNull().default(true), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), revoked: boolean("revoked").notNull().default(false), createdBy: uuid("created_by"), createdAt: created() });
export const proofViews = pgTable("proof_views", { id: id(), linkId: uuid("link_id").notNull(), viewedAt: created(), viewerHint: text("viewer_hint") });

// ── v9: on-premise Box ───────────────────────────────────────────────────
export const boxReports = pgTable("box_reports", { id: id(), restaurantId: uuid("restaurant_id").notNull(), reportedAt: created(), salesToday: money("sales_today"), openOrders: integer("open_orders"), rooms: integer("rooms"), occupied: integer("occupied"), users: integer("users"), periods: jsonb("periods").notNull().default("[]"), raw: jsonb("raw") });
