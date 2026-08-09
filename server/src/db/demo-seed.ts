import { eq, and } from "drizzle-orm";
import { db, pool } from "./db.js";
import {
  attachments,
  customers,
  engineerProfiles,
  fileChunks,
  files,
  projects,
  roles,
  ticketCategories,
  ticketHistory,
  tickets,
  userRoles,
  users,
} from "./schema/index.js";
import { hashPassword } from "../utils/hash.js";
import { seedUsers } from "./seed.js";

const DEMO_AUTHOR = "demo_seed";
const DEMO_PASSWORD = "Demo@123";

type DemoUser = {
  key: string;
  name: string;
  email: string;
  role: string;
  phone: string;
};

type DemoTicket = {
  projectKey: string;
  categoryKey: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  state: string;
  city: string;
  pincode: string;
  address: string;
  engineerKey?: string;
  plannerKey?: string;
  escalationLevel?: string;
  replacementRequested?: boolean;
  replacementStatus?: string;
  payoutAmount?: number;
  slaOffsetDays: number;
  closedOffsetDays?: number;
  attachmentKeys?: string[];
  history: Array<{
    action: string;
    status: string;
    remarks: string;
    authorKey: string;
  }>;
};

const DEMO_USERS: DemoUser[] = [
  {
    key: "ph-west",
    name: "Riya Kapoor",
    email: "riya.projecthead@demo.com",
    role: "project_head",
    phone: "9000001001",
  },
  {
    key: "ph-south",
    name: "Arjun Menon",
    email: "arjun.projecthead@demo.com",
    role: "project_head",
    phone: "9000001002",
  },
  {
    key: "planner-maha",
    name: "Neha Patil",
    email: "neha.planner@demo.com",
    role: "state_planner",
    phone: "9000001003",
  },
  {
    key: "noc-lead",
    name: "Karan Mehta",
    email: "karan.noc@demo.com",
    role: "noc",
    phone: "9000001004",
  },
  {
    key: "eng-pune",
    name: "Vikram Jadhav",
    email: "vikram.engineer@demo.com",
    role: "engineer",
    phone: "9000001005",
  },
  {
    key: "eng-mumbai",
    name: "Sana Shaikh",
    email: "sana.engineer@demo.com",
    role: "engineer",
    phone: "9000001006",
  },
  {
    key: "eng-bengaluru",
    name: "Rohit Bhat",
    email: "rohit.engineer@demo.com",
    role: "engineer",
    phone: "9000001007",
  },
  {
    key: "cust-acme-user",
    name: "Anita Sharma",
    email: "anita@acmeretail.demo",
    role: "customer",
    phone: "9000001008",
  },
  {
    key: "cust-globe-user",
    name: "Mohan Rao",
    email: "mohan@globelogix.demo",
    role: "customer",
    phone: "9000001009",
  },
  {
    key: "cust-north-user",
    name: "Pooja Verma",
    email: "pooja@northstar.demo",
    role: "customer",
    phone: "9000001010",
  },
];

const CUSTOMER_DEMOS = [
  {
    key: "acme",
    userKey: "cust-acme-user",
    companyName: "Acme Retail Pvt Ltd",
    contactPersonName: "Anita Sharma",
    email: "support@acmeretail.demo",
    phone: "9988776611",
    secondaryContactName: "Harish Gupta",
    secondaryContactEmail: "ops@acmeretail.demo",
    secondaryContactPhone: "9988776612",
    addressState: "Maharashtra",
    addressCity: "Mumbai",
    addressPincode: "400001",
    referenceId: "CUST-DEMO-001",
  },
  {
    key: "globe",
    userKey: "cust-globe-user",
    companyName: "GlobeLogix Services",
    contactPersonName: "Mohan Rao",
    email: "hello@globelogix.demo",
    phone: "9988776621",
    secondaryContactName: "Ira Nair",
    secondaryContactEmail: "projects@globelogix.demo",
    secondaryContactPhone: "9988776622",
    addressState: "Karnataka",
    addressCity: "Bengaluru",
    addressPincode: "560001",
    referenceId: "CUST-DEMO-002",
  },
  {
    key: "north",
    userKey: "cust-north-user",
    companyName: "Northstar HealthTech",
    contactPersonName: "Pooja Verma",
    email: "desk@northstar.demo",
    phone: "9988776631",
    secondaryContactName: "Ajay Singh",
    secondaryContactEmail: "facilities@northstar.demo",
    secondaryContactPhone: "9988776632",
    addressState: "Delhi",
    addressCity: "New Delhi",
    addressPincode: "110001",
    referenceId: "CUST-DEMO-003",
  },
];

const ENGINEER_PROFILE_DEMOS = [
  {
    userKey: "eng-pune",
    referenceId: "ENG-DEMO-001",
    addressState: "Maharashtra",
    addressCity: "Pune",
    addressPincode: "411001",
    assignedState: "Maharashtra",
    profilePhotoUrl: "https://images.example.com/demo/eng-pune.png",
    aadhaarFrontUrl: "https://docs.example.com/demo/eng-pune-aadhaar-front.pdf",
    aadhaarBackUrl: "https://docs.example.com/demo/eng-pune-aadhaar-back.pdf",
    panCardUrl: "https://docs.example.com/demo/eng-pune-pan.pdf",
    dlFrontUrl: "https://docs.example.com/demo/eng-pune-dl-front.pdf",
    dlBackUrl: "https://docs.example.com/demo/eng-pune-dl-back.pdf",
    documentsStatus: "approved",
    bankAccountNumber: "123456789012",
    ifscCode: "HDFC0001234",
    accountHolderName: "Vikram Jadhav",
    cancelChequeUrl: "https://docs.example.com/demo/eng-pune-cheque.pdf",
  },
  {
    userKey: "eng-mumbai",
    referenceId: "ENG-DEMO-002",
    addressState: "Maharashtra",
    addressCity: "Mumbai",
    addressPincode: "400051",
    assignedState: "Maharashtra",
    profilePhotoUrl: "https://images.example.com/demo/eng-mumbai.png",
    aadhaarFrontUrl: "https://docs.example.com/demo/eng-mumbai-aadhaar-front.pdf",
    aadhaarBackUrl: "https://docs.example.com/demo/eng-mumbai-aadhaar-back.pdf",
    panCardUrl: "https://docs.example.com/demo/eng-mumbai-pan.pdf",
    dlFrontUrl: "https://docs.example.com/demo/eng-mumbai-dl-front.pdf",
    dlBackUrl: "https://docs.example.com/demo/eng-mumbai-dl-back.pdf",
    documentsStatus: "approved",
    bankAccountNumber: "123456789013",
    ifscCode: "ICIC0001234",
    accountHolderName: "Sana Shaikh",
    cancelChequeUrl: "https://docs.example.com/demo/eng-mumbai-cheque.pdf",
  },
  {
    userKey: "eng-bengaluru",
    referenceId: "ENG-DEMO-003",
    addressState: "Karnataka",
    addressCity: "Bengaluru",
    addressPincode: "560038",
    assignedState: "Karnataka",
    profilePhotoUrl: "https://images.example.com/demo/eng-bengaluru.png",
    aadhaarFrontUrl: "https://docs.example.com/demo/eng-bengaluru-aadhaar-front.pdf",
    aadhaarBackUrl: "https://docs.example.com/demo/eng-bengaluru-aadhaar-back.pdf",
    panCardUrl: "https://docs.example.com/demo/eng-bengaluru-pan.pdf",
    dlFrontUrl: "https://docs.example.com/demo/eng-bengaluru-dl-front.pdf",
    dlBackUrl: "https://docs.example.com/demo/eng-bengaluru-dl-back.pdf",
    documentsStatus: "approved",
    bankAccountNumber: "123456789014",
    ifscCode: "SBIN0001234",
    accountHolderName: "Rohit Bhat",
    cancelChequeUrl: "https://docs.example.com/demo/eng-bengaluru-cheque.pdf",
  },
];

const CATEGORY_DEMOS = [
  { key: "network", name: "Network Issue", defaultPayout: 1200 },
  { key: "hardware", name: "Hardware Replacement", defaultPayout: 1800 },
  { key: "install", name: "Device Installation", defaultPayout: 1500 },
  { key: "maintenance", name: "Preventive Maintenance", defaultPayout: 900 },
];

const PROJECT_DEMOS = [
  {
    key: "acme-west",
    customerKey: "acme",
    projectHeadKey: "ph-west",
    name: "Acme West Region Rollout",
  },
  {
    key: "acme-warehouse",
    customerKey: "acme",
    projectHeadKey: "ph-west",
    name: "Acme Warehouse Monitoring",
  },
  {
    key: "globe-south",
    customerKey: "globe",
    projectHeadKey: "ph-south",
    name: "GlobeLogix South SLA Program",
  },
  {
    key: "north-clinics",
    customerKey: "north",
    projectHeadKey: "ph-south",
    name: "Northstar Clinic Uptime Support",
  },
];

const FILE_DEMOS = [
  {
    key: "site-photo-1",
    name: "site-photo-1",
    altName: "Demo site photo 1",
    filename: "demo-site-photo-1.png",
    mimeType: "image/png",
    ext: "png",
    usageType: "demo",
    data: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3FoXcAAAAASUVORK5CYII=",
      "base64",
    ),
  },
  {
    key: "site-photo-2",
    name: "site-photo-2",
    altName: "Demo site photo 2",
    filename: "demo-site-photo-2.png",
    mimeType: "image/png",
    ext: "png",
    usageType: "demo",
    data: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAusB9Y9vDOMAAAAASUVORK5CYII=",
      "base64",
    ),
  },
  {
    key: "installation-proof",
    name: "installation-proof",
    altName: "Installation proof",
    filename: "installation-proof.png",
    mimeType: "image/png",
    ext: "png",
    usageType: "demo",
    data: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP4DwQACfsD/Q4A0MkAAAAASUVORK5CYII=",
      "base64",
    ),
  },
  {
    key: "ir-report-1",
    name: "ir-report-1",
    altName: "Incident report 1",
    filename: "incident-report-1.pdf",
    mimeType: "application/pdf",
    ext: "pdf",
    usageType: "demo",
    data: Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 36 96 Td (Demo Incident Report) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
      "utf8",
    ),
  },
];

const TICKET_DEMOS: DemoTicket[] = [
  {
    projectKey: "acme-west",
    categoryKey: "network",
    title: "POS terminal offline at Mumbai flagship store",
    description: "Store manager reported that the primary POS terminal lost network connectivity during peak hours.",
    priority: "high",
    status: "open",
    state: "Maharashtra",
    city: "Mumbai",
    pincode: "400001",
    address: "Acme Retail, Fort Branch, Mumbai",
    plannerKey: "planner-maha",
    payoutAmount: 1200,
    slaOffsetDays: 1,
    history: [
      {
        action: "created",
        status: "open",
        remarks: "Ticket raised by customer portal",
        authorKey: "cust-acme-user",
      },
    ],
  },
  {
    projectKey: "acme-west",
    categoryKey: "hardware",
    title: "Barcode scanner replacement required",
    description: "Scanner intermittently disconnects and fails during billing.",
    priority: "critical",
    status: "assigned",
    state: "Maharashtra",
    city: "Pune",
    pincode: "411014",
    address: "Acme Retail, Viman Nagar, Pune",
    engineerKey: "eng-pune",
    plannerKey: "planner-maha",
    escalationLevel: "L1",
    payoutAmount: 1800,
    slaOffsetDays: 2,
    attachmentKeys: ["site-photo-1"],
    history: [
      {
        action: "created",
        status: "open",
        remarks: "Ticket created for scanner issue",
        authorKey: "cust-acme-user",
      },
      {
        action: "assigned",
        status: "assigned",
        remarks: "Assigned to Pune engineer",
        authorKey: "planner-maha",
      },
    ],
  },
  {
    projectKey: "acme-warehouse",
    categoryKey: "install",
    title: "New CCTV node installation pending completion",
    description: "Engineer reached site and is awaiting rack access from facility team.",
    priority: "medium",
    status: "in_progress",
    state: "Maharashtra",
    city: "Nashik",
    pincode: "422001",
    address: "Acme Central Warehouse, Nashik",
    engineerKey: "eng-pune",
    plannerKey: "planner-maha",
    payoutAmount: 1500,
    slaOffsetDays: 3,
    attachmentKeys: ["installation-proof"],
    history: [
      {
        action: "created",
        status: "open",
        remarks: "Installation request received",
        authorKey: "cust-acme-user",
      },
      {
        action: "assigned",
        status: "assigned",
        remarks: "Assigned to field engineer",
        authorKey: "planner-maha",
      },
      {
        action: "status_updated",
        status: "in_progress",
        remarks: "Engineer on site and work started",
        authorKey: "eng-pune",
      },
    ],
  },
  {
    projectKey: "globe-south",
    categoryKey: "maintenance",
    title: "Quarterly preventive maintenance visit completed",
    description: "All router and edge devices cleaned and firmware checked.",
    priority: "low",
    status: "pending_validation",
    state: "Karnataka",
    city: "Bengaluru",
    pincode: "560001",
    address: "GlobeLogix HQ, MG Road, Bengaluru",
    engineerKey: "eng-bengaluru",
    plannerKey: "planner-maha",
    payoutAmount: 900,
    slaOffsetDays: 1,
    attachmentKeys: ["site-photo-2", "ir-report-1"],
    history: [
      {
        action: "created",
        status: "open",
        remarks: "PM visit scheduled",
        authorKey: "cust-globe-user",
      },
      {
        action: "assigned",
        status: "assigned",
        remarks: "Bengaluru engineer assigned",
        authorKey: "planner-maha",
      },
      {
        action: "status_updated",
        status: "in_progress",
        remarks: "Maintenance work in progress",
        authorKey: "eng-bengaluru",
      },
      {
        action: "status_updated",
        status: "resolved",
        remarks: "Maintenance completed",
        authorKey: "eng-bengaluru",
      },
      {
        action: "status_updated",
        status: "pending_validation",
        remarks: "Awaiting validation from project team",
        authorKey: "ph-south",
      },
    ],
  },
  {
    projectKey: "globe-south",
    categoryKey: "network",
    title: "Branch uplink unstable after ISP cutover",
    description: "Connectivity drops every 15 minutes after the ISP maintenance activity.",
    priority: "high",
    status: "resolved",
    state: "Tamil Nadu",
    city: "Chennai",
    pincode: "600002",
    address: "GlobeLogix Branch Office, Chennai",
    engineerKey: "eng-bengaluru",
    plannerKey: "planner-maha",
    escalationLevel: "L2",
    payoutAmount: 1200,
    slaOffsetDays: 2,
    history: [
      {
        action: "created",
        status: "open",
        remarks: "Issue reported after ISP cutover",
        authorKey: "cust-globe-user",
      },
      {
        action: "assigned",
        status: "assigned",
        remarks: "Remote troubleshooting owner assigned",
        authorKey: "planner-maha",
      },
      {
        action: "status_updated",
        status: "in_progress",
        remarks: "Logs captured and ISP engaged",
        authorKey: "eng-bengaluru",
      },
      {
        action: "status_updated",
        status: "resolved",
        remarks: "Stable after route rollback",
        authorKey: "eng-bengaluru",
      },
    ],
  },
  {
    projectKey: "north-clinics",
    categoryKey: "hardware",
    title: "UPS battery replacement at clinic reception",
    description: "Power backup failed during a short outage and battery health is below threshold.",
    priority: "medium",
    status: "closed",
    state: "Delhi",
    city: "New Delhi",
    pincode: "110001",
    address: "Northstar Clinic, Connaught Place",
    engineerKey: "eng-mumbai",
    plannerKey: "planner-maha",
    payoutAmount: 1800,
    slaOffsetDays: -2,
    closedOffsetDays: -1,
    attachmentKeys: ["ir-report-1"],
    history: [
      {
        action: "created",
        status: "open",
        remarks: "Battery replacement ticket raised",
        authorKey: "cust-north-user",
      },
      {
        action: "assigned",
        status: "assigned",
        remarks: "Assigned to engineer with spare stock",
        authorKey: "planner-maha",
      },
      {
        action: "status_updated",
        status: "in_progress",
        remarks: "Engineer reached clinic",
        authorKey: "eng-mumbai",
      },
      {
        action: "status_updated",
        status: "resolved",
        remarks: "UPS battery replaced successfully",
        authorKey: "eng-mumbai",
      },
      {
        action: "status_updated",
        status: "pending_validation",
        remarks: "Waiting for sign-off from clinic manager",
        authorKey: "ph-south",
      },
      {
        action: "status_updated",
        status: "closed",
        remarks: "Validated and closed",
        authorKey: "noc-lead",
      },
    ],
  },
  {
    projectKey: "north-clinics",
    categoryKey: "install",
    title: "Reception kiosk relocation",
    description: "Kiosk needs to be reinstalled in the newly renovated waiting area.",
    priority: "medium",
    status: "assigned",
    state: "Delhi",
    city: "New Delhi",
    pincode: "110048",
    address: "Northstar Daycare Centre, GK-II",
    engineerKey: "eng-mumbai",
    plannerKey: "planner-maha",
    payoutAmount: 1500,
    slaOffsetDays: 4,
    history: [
      {
        action: "created",
        status: "open",
        remarks: "Relocation planned by facilities team",
        authorKey: "cust-north-user",
      },
      {
        action: "assigned",
        status: "assigned",
        remarks: "Engineer scheduled for tomorrow",
        authorKey: "planner-maha",
      },
    ],
  },
  {
    projectKey: "acme-warehouse",
    categoryKey: "network",
    title: "Warehouse Wi-Fi dead zone on aisle 9",
    description: "Handheld scanners lose connectivity in one storage aisle.",
    priority: "medium",
    status: "closed",
    state: "Maharashtra",
    city: "Nagpur",
    pincode: "440001",
    address: "Acme Overflow Warehouse, Nagpur",
    engineerKey: "eng-pune",
    plannerKey: "planner-maha",
    escalationLevel: "L1",
    payoutAmount: 1200,
    slaOffsetDays: -1,
    closedOffsetDays: 0,
    history: [
      {
        action: "created",
        status: "open",
        remarks: "Coverage issue raised by warehouse ops",
        authorKey: "cust-acme-user",
      },
      {
        action: "assigned",
        status: "assigned",
        remarks: "Assigned for RF survey",
        authorKey: "planner-maha",
      },
      {
        action: "status_updated",
        status: "in_progress",
        remarks: "Additional AP mounted",
        authorKey: "eng-pune",
      },
      {
        action: "status_updated",
        status: "resolved",
        remarks: "Signal strength improved",
        authorKey: "eng-pune",
      },
      {
        action: "status_updated",
        status: "pending_validation",
        remarks: "Ops confirmed stable scans",
        authorKey: "ph-west",
      },
      {
        action: "status_updated",
        status: "closed",
        remarks: "Ticket closed after 24h observation",
        authorKey: "noc-lead",
      },
    ],
  },
  {
    projectKey: "globe-south",
    categoryKey: "hardware",
    title: "Router RMA requested for recurring boot loop",
    description: "Branch router keeps restarting after power normalization.",
    priority: "critical",
    status: "in_progress",
    state: "Karnataka",
    city: "Mysuru",
    pincode: "570001",
    address: "GlobeLogix Regional Office, Mysuru",
    engineerKey: "eng-bengaluru",
    plannerKey: "planner-maha",
    replacementRequested: true,
    replacementStatus: "requested",
    escalationLevel: "L3",
    payoutAmount: 1800,
    slaOffsetDays: 1,
    attachmentKeys: ["site-photo-1", "ir-report-1"],
    history: [
      {
        action: "created",
        status: "open",
        remarks: "High-priority hardware fault raised",
        authorKey: "cust-globe-user",
      },
      {
        action: "assigned",
        status: "assigned",
        remarks: "Assigned to Bengaluru field team",
        authorKey: "planner-maha",
      },
      {
        action: "status_updated",
        status: "in_progress",
        remarks: "RMA requested with OEM",
        authorKey: "eng-bengaluru",
      },
    ],
  },
  {
    projectKey: "north-clinics",
    categoryKey: "maintenance",
    title: "Server room preventive inspection overdue",
    description: "Quarterly inspection pending because prior visit was rescheduled.",
    priority: "low",
    status: "open",
    state: "Haryana",
    city: "Gurugram",
    pincode: "122001",
    address: "Northstar Back Office, Gurugram",
    payoutAmount: 900,
    slaOffsetDays: 5,
    history: [
      {
        action: "created",
        status: "open",
        remarks: "Created by operations team for upcoming PM cycle",
        authorKey: "cust-north-user",
      },
    ],
  },
];

async function ensureRole(roleName: string): Promise<string> {
  const [existing] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.name, roleName), eq(roles.deleted, false)));

  if (existing) return existing.id;

  const [created] = await db
    .insert(roles)
    .values({ name: roleName, author: DEMO_AUTHOR })
    .returning({ id: roles.id });

  return created.id;
}

async function cleanupDemoData() {
  await pool.query("BEGIN");

  try {
    await pool.query("DELETE FROM ticket.attachments WHERE author = $1", [DEMO_AUTHOR]);
    await pool.query("DELETE FROM ticket.ticket_history WHERE author = $1", [DEMO_AUTHOR]);
    await pool.query("DELETE FROM ticket.tickets WHERE author = $1", [DEMO_AUTHOR]);
    await pool.query("DELETE FROM ticket.projects WHERE author = $1", [DEMO_AUTHOR]);
    await pool.query("DELETE FROM ticket.customers WHERE author = $1", [DEMO_AUTHOR]);
    await pool.query("DELETE FROM ticket.engineer_profiles WHERE author = $1", [DEMO_AUTHOR]);
    await pool.query("DELETE FROM ticket.file_chunks WHERE file_id IN (SELECT id FROM ticket.files WHERE usage_type = $1)", ["demo"]);
    await pool.query("DELETE FROM ticket.files WHERE usage_type = $1", ["demo"]);
    await pool.query("DELETE FROM portal.user_roles WHERE author = $1", [DEMO_AUTHOR]);
    await pool.query("DELETE FROM portal.users WHERE author = $1", [DEMO_AUTHOR]);
    await pool.query("DELETE FROM ticket.ticket_categories WHERE author = $1", [DEMO_AUTHOR]);

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function createUserWithRole(input: DemoUser) {
  const roleId = await ensureRole(input.role);
  const password = await hashPassword(DEMO_PASSWORD);

  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password,
      status: "active",
      author: DEMO_AUTHOR,
    })
    .returning();

  await db.insert(userRoles).values({
    userId: user.id,
    roleId,
    author: DEMO_AUTHOR,
  });

  return user;
}

async function createDemoFile(input: (typeof FILE_DEMOS)[number]) {
  const [file] = await db
    .insert(files)
    .values({
      name: input.name,
      altName: input.altName,
      filename: input.filename,
      mimeType: input.mimeType,
      ext: input.ext,
      size: input.data.length,
      chunkCount: 1,
      storagePath: `demo/${input.filename}`,
      usageType: input.usageType,
      width: input.mimeType.startsWith("image/") ? 1 : null,
      height: input.mimeType.startsWith("image/") ? 1 : null,
      tags: { demo: true, key: input.key },
      exif: {},
    })
    .returning();

  await db.insert(fileChunks).values({
    fileId: file.id,
    chunkIndex: 0,
    data: input.data,
  });

  return file;
}

export async function seedDemoData() {
  await seedUsers();
  await cleanupDemoData();

  const userMap = new Map<string, typeof users.$inferSelect>();
  const customerMap = new Map<string, typeof customers.$inferSelect>();
  const categoryMap = new Map<string, typeof ticketCategories.$inferSelect>();
  const projectMap = new Map<string, typeof projects.$inferSelect>();
  const fileMap = new Map<string, typeof files.$inferSelect>();

  for (const demoUser of DEMO_USERS) {
    const user = await createUserWithRole(demoUser);
    userMap.set(demoUser.key, user);
  }

  const [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, "admin@system.com"));

  if (!adminUser) {
    throw new Error("Expected admin@system.com to exist after base seeding");
  }

  for (const customerDemo of CUSTOMER_DEMOS) {
    const user = userMap.get(customerDemo.userKey);
    if (!user) throw new Error(`Missing demo user ${customerDemo.userKey}`);

    const [customer] = await db
      .insert(customers)
      .values({
        ...customerDemo,
        userId: user.id,
        status: "active",
        approvedBy: adminUser.id,
        approvedAt: new Date(),
        author: DEMO_AUTHOR,
      })
      .returning();

    customerMap.set(customerDemo.key, customer);
  }

  for (const profileDemo of ENGINEER_PROFILE_DEMOS) {
    const user = userMap.get(profileDemo.userKey);
    if (!user) throw new Error(`Missing engineer user ${profileDemo.userKey}`);

    await db.insert(engineerProfiles).values({
      ...profileDemo,
      userId: user.id,
      author: DEMO_AUTHOR,
    });
  }

  for (const categoryDemo of CATEGORY_DEMOS) {
    const [category] = await db
      .insert(ticketCategories)
      .values({
        name: categoryDemo.name,
        defaultPayout: categoryDemo.defaultPayout,
        author: DEMO_AUTHOR,
      })
      .returning();

    categoryMap.set(categoryDemo.key, category);
  }

  for (const projectDemo of PROJECT_DEMOS) {
    const customer = customerMap.get(projectDemo.customerKey);
    const projectHead = userMap.get(projectDemo.projectHeadKey);

    if (!customer) throw new Error(`Missing customer ${projectDemo.customerKey}`);
    if (!projectHead) throw new Error(`Missing project head ${projectDemo.projectHeadKey}`);

    const [project] = await db
      .insert(projects)
      .values({
        customerId: customer.id,
        projectHeadId: projectHead.id,
        name: projectDemo.name,
        author: DEMO_AUTHOR,
      })
      .returning();

    projectMap.set(projectDemo.key, project);
  }

  for (const fileDemo of FILE_DEMOS) {
    const file = await createDemoFile(fileDemo);
    fileMap.set(fileDemo.key, file);
  }

  const createdTickets: Array<{ id: string; ticketNumber: string; title: string }> = [];

  for (let index = 0; index < TICKET_DEMOS.length; index += 1) {
    const demoTicket = TICKET_DEMOS[index];
    const project = projectMap.get(demoTicket.projectKey);
    const category = categoryMap.get(demoTicket.categoryKey);
    const engineer = demoTicket.engineerKey
      ? userMap.get(demoTicket.engineerKey)
      : undefined;
    const planner = demoTicket.plannerKey
      ? userMap.get(demoTicket.plannerKey)
      : undefined;

    if (!project) throw new Error(`Missing project ${demoTicket.projectKey}`);
    if (!category) throw new Error(`Missing category ${demoTicket.categoryKey}`);

    const createdAt = new Date(Date.now() - (index + 1) * 24 * 60 * 60 * 1000);
    const slaDeadline = new Date(
      Date.now() + demoTicket.slaOffsetDays * 24 * 60 * 60 * 1000,
    );
    const closedAt =
      demoTicket.closedOffsetDays !== undefined
        ? new Date(Date.now() + demoTicket.closedOffsetDays * 24 * 60 * 60 * 1000)
        : null;

    const [ticket] = await db
      .insert(tickets)
      .values({
        ticketNumber: `DEMO-TKT-${String(index + 1).padStart(3, "0")}`,
        projectId: project.id,
        categoryId: category.id,
        title: demoTicket.title,
        description: demoTicket.description,
        priority: demoTicket.priority,
        status: demoTicket.status,
        state: demoTicket.state,
        city: demoTicket.city,
        pincode: demoTicket.pincode,
        address: demoTicket.address,
        assignedEngineerId: engineer?.id,
        assignedStatePlannerId: planner?.id,
        escalationLevel: demoTicket.escalationLevel,
        replacementRequested: demoTicket.replacementRequested ?? false,
        replacementStatus: demoTicket.replacementStatus,
        payoutAmount: demoTicket.payoutAmount ?? category.defaultPayout ?? null,
        slaDeadline,
        closedAt,
        author: DEMO_AUTHOR,
        createdAt,
      })
      .returning();

    createdTickets.push({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber ?? ticket.id,
      title: ticket.title ?? "Untitled",
    });

    for (let historyIndex = 0; historyIndex < demoTicket.history.length; historyIndex += 1) {
      const item = demoTicket.history[historyIndex];
      const authorUser = userMap.get(item.authorKey);
      const authorId = authorUser?.id ?? adminUser.id;

      await db.insert(ticketHistory).values({
        ticketId: ticket.id,
        action: item.action,
        status: item.status,
        remarks: item.remarks,
        authorId,
        author: DEMO_AUTHOR,
        createdAt: new Date(createdAt.getTime() + historyIndex * 60 * 60 * 1000),
      });
    }

    for (const attachmentKey of demoTicket.attachmentKeys ?? []) {
      const file = fileMap.get(attachmentKey);
      if (!file) throw new Error(`Missing file ${attachmentKey}`);

      await db.insert(attachments).values({
        ticketId: ticket.id,
        type: file.mimeType === "application/pdf" ? "ir" : "image",
        fileUrl: `/file/${file.id}`,
        uploadedBy: engineer?.id ?? adminUser.id,
        author: DEMO_AUTHOR,
        uploadedAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
      });
    }
  }

  return {
    password: DEMO_PASSWORD,
    users: DEMO_USERS.length + 6,
    customers: CUSTOMER_DEMOS.length,
    engineerProfiles: ENGINEER_PROFILE_DEMOS.length,
    categories: CATEGORY_DEMOS.length,
    projects: PROJECT_DEMOS.length,
    files: FILE_DEMOS.length,
    tickets: createdTickets.length,
    ticketsCreated: createdTickets,
  };
}
