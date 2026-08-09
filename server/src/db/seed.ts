import { eq, and } from "drizzle-orm";
import { ROLE_PERMISSIONS } from "../config/roles.js";
import { db } from "./db.js";
import {
  users,
  roles,
  userRoles,
  customers,
  engineerProfiles,
  projects,
  ticketCategories,
  tickets,
  ticketHistory,
  attachments,
  inventoryItems,
  inventoryTransactions,
} from "./schema/index.js";
import { hashPassword } from "../utils/hash.js";

type SeedUser = {
  name: string;
  email: string;
  role: string;
  phone?: string;
};

const SEED_PASSWORD = "Admin@123";

const SEED_USERS: SeedUser[] = [
  { name: "Super Admin", email: "admin@system.com", role: "super_admin", phone: "9000000001" },
  { name: "NOC Operator", email: "noc@system.com", role: "noc", phone: "9000000002" },
  { name: "State Planner West", email: "planner@system.com", role: "state_planner", phone: "9000000003" },
  { name: "State Planner South", email: "planner2@system.com", role: "state_planner", phone: "9000000004" },
  { name: "Project Head Alpha", email: "project@system.com", role: "project_head", phone: "9000000005" },
  { name: "Project Head Beta", email: "project2@system.com", role: "project_head", phone: "9000000006" },
  { name: "Customer User One", email: "customer@system.com", role: "customer", phone: "9000000007" },
  { name: "Customer User Two", email: "customer2@system.com", role: "customer", phone: "9000000008" },
  { name: "Customer User Three", email: "customer3@system.com", role: "customer", phone: "9000000009" },
  { name: "Arjun Kumar", email: "engineer@system.com", role: "engineer", phone: "9000000010" },
  { name: "Mohammed Ali", email: "engineer2@system.com", role: "engineer", phone: "9000000011" },
  { name: "Deepa Nair", email: "engineer3@system.com", role: "engineer", phone: "9000000012" },
  { name: "Ravi Patel", email: "engineer4@system.com", role: "engineer", phone: "9000000013" },
  { name: "Kavya Reddy", email: "engineer5@system.com", role: "engineer", phone: "9000000014" },
];

async function ensureRole(roleName: string): Promise<string> {
  const [existing] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.name, roleName), eq(roles.deleted, false)));

  if (existing) return existing.id;

  const [created] = await db
    .insert(roles)
    .values({ name: roleName, author: "seed" })
    .returning({ id: roles.id });

  return created.id;
}

export async function seedRoles(): Promise<{
  created: string[];
  skipped: string[];
}> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const roleName of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
    const [existing] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.name, roleName), eq(roles.deleted, false)));

    if (existing) {
      skipped.push(roleName);
      continue;
    }

    await db.insert(roles).values({ name: roleName, author: "seed" });
    created.push(roleName);
  }

  return { created, skipped };
}

export async function seedUsers(): Promise<{
  created: string[];
  skipped: string[];
  userIdMap: Record<string, string>;
}> {
  const created: string[] = [];
  const skipped: string[] = [];
  const userIdMap: Record<string, string> = {};

  for (const seedUser of SEED_USERS) {
    const roleId = await ensureRole(seedUser.role);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, seedUser.email), eq(users.deleted, false)));

    if (existing) {
      await db
        .update(users)
        .set({ name: seedUser.name, status: "active", author: "seed" })
        .where(eq(users.id, existing.id));

      const [existingRoleLink] = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, existing.id),
            eq(userRoles.roleId, roleId),
            eq(userRoles.deleted, false),
          ),
        );

      if (!existingRoleLink) {
        await db.insert(userRoles).values({ userId: existing.id, roleId, author: "seed" });
      }

      userIdMap[seedUser.email] = existing.id;
      skipped.push(seedUser.email);
      continue;
    }

    const hashedPassword = await hashPassword(SEED_PASSWORD);
    const [newUser] = await db
      .insert(users)
      .values({
        name: seedUser.name,
        email: seedUser.email,
        phone: seedUser.phone,
        password: hashedPassword,
        status: "active",
        author: "seed",
      })
      .returning({ id: users.id });

    await db.insert(userRoles).values({ userId: newUser.id, roleId, author: "seed" });

    userIdMap[seedUser.email] = newUser.id;
    created.push(seedUser.email);
  }

  return { created, skipped, userIdMap };
}

// ---------------------------------------------------------------------------
// Ticket Categories
// ---------------------------------------------------------------------------

const SEED_CATEGORIES = [
  { name: "Network Installation", defaultPayout: 2500 },
  { name: "Hardware Replacement", defaultPayout: 3000 },
  { name: "Software Configuration", defaultPayout: 1500 },
  { name: "Site Survey", defaultPayout: 1000 },
  { name: "Preventive Maintenance", defaultPayout: 2000 },
  { name: "Fibre Splicing", defaultPayout: 3500 },
  { name: "Router Configuration", defaultPayout: 2000 },
];

export async function seedTicketCategories(): Promise<{
  created: string[];
  skipped: string[];
  categoryIdMap: Record<string, string>;
}> {
  const created: string[] = [];
  const skipped: string[] = [];
  const categoryIdMap: Record<string, string> = {};

  for (const cat of SEED_CATEGORIES) {
    const [existing] = await db
      .select({ id: ticketCategories.id })
      .from(ticketCategories)
      .where(and(eq(ticketCategories.name, cat.name), eq(ticketCategories.deleted, false)));

    if (existing) {
      categoryIdMap[cat.name] = existing.id;
      skipped.push(cat.name);
      continue;
    }

    const [created_] = await db
      .insert(ticketCategories)
      .values({ name: cat.name, defaultPayout: cat.defaultPayout, author: "seed" })
      .returning({ id: ticketCategories.id });

    categoryIdMap[cat.name] = created_.id;
    created.push(cat.name);
  }

  return { created, skipped, categoryIdMap };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

type SeedCustomer = {
  companyName: string;
  contactPersonName: string;
  email: string;
  phone: string;
  secondaryContactName: string;
  secondaryContactEmail: string;
  secondaryContactPhone: string;
  addressState: string;
  addressCity: string;
  addressPincode: string;
  referenceId: string;
  userEmail: string; // maps to portal user
};

const SEED_CUSTOMERS: SeedCustomer[] = [
  {
    companyName: "TechCorp Solutions Pvt Ltd",
    contactPersonName: "Amit Desai",
    email: "amit.desai@techcorp.in",
    phone: "9876500001",
    secondaryContactName: "Neha Gupta",
    secondaryContactEmail: "neha.gupta@techcorp.in",
    secondaryContactPhone: "9876500002",
    addressState: "Maharashtra",
    addressCity: "Mumbai",
    addressPincode: "400001",
    referenceId: "CUST-001",
    userEmail: "customer@system.com",
  },
  {
    companyName: "GlobalNet Systems Ltd",
    contactPersonName: "Sanjay Mishra",
    email: "sanjay.mishra@globalnet.in",
    phone: "9876500003",
    secondaryContactName: "Rekha Joshi",
    secondaryContactEmail: "rekha.joshi@globalnet.in",
    secondaryContactPhone: "9876500004",
    addressState: "Karnataka",
    addressCity: "Bengaluru",
    addressPincode: "560001",
    referenceId: "CUST-002",
    userEmail: "customer2@system.com",
  },
  {
    companyName: "CloudEdge Technologies",
    contactPersonName: "Preethi Nair",
    email: "preethi.nair@cloudedge.in",
    phone: "9876500005",
    secondaryContactName: "Kiran Iyer",
    secondaryContactEmail: "kiran.iyer@cloudedge.in",
    secondaryContactPhone: "9876500006",
    addressState: "Tamil Nadu",
    addressCity: "Chennai",
    addressPincode: "600001",
    referenceId: "CUST-003",
    userEmail: "customer3@system.com",
  },
];

export async function seedCustomers(userIdMap: Record<string, string>): Promise<{
  created: string[];
  skipped: string[];
  customerIdMap: Record<string, string>;
}> {
  const created: string[] = [];
  const skipped: string[] = [];
  const customerIdMap: Record<string, string> = {};

  for (const cust of SEED_CUSTOMERS) {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.referenceId, cust.referenceId), eq(customers.deleted, false)));

    if (existing) {
      customerIdMap[cust.referenceId] = existing.id;
      skipped.push(cust.referenceId);
      continue;
    }

    const userId = userIdMap[cust.userEmail];
    const adminId = userIdMap["admin@system.com"];

    const [created_] = await db
      .insert(customers)
      .values({
        companyName: cust.companyName,
        contactPersonName: cust.contactPersonName,
        email: cust.email,
        phone: cust.phone,
        secondaryContactName: cust.secondaryContactName,
        secondaryContactEmail: cust.secondaryContactEmail,
        secondaryContactPhone: cust.secondaryContactPhone,
        addressState: cust.addressState,
        addressCity: cust.addressCity,
        addressPincode: cust.addressPincode,
        referenceId: cust.referenceId,
        userId,
        status: "active",
        approvedBy: adminId,
        approvedAt: new Date(),
        author: "seed",
      })
      .returning({ id: customers.id });

    customerIdMap[cust.referenceId] = created_.id;
    created.push(cust.referenceId);
  }

  return { created, skipped, customerIdMap };
}

// ---------------------------------------------------------------------------
// Engineer Profiles
// ---------------------------------------------------------------------------

type SeedEngineerProfile = {
  userEmail: string;
  referenceId: string;
  addressState: string;
  addressCity: string;
  addressPincode: string;
  assignedState: string;
  bankAccountNumber: string;
  ifscCode: string;
  accountHolderName: string;
};

const SEED_ENGINEER_PROFILES: SeedEngineerProfile[] = [
  {
    userEmail: "engineer@system.com",
    referenceId: "ENG-001",
    addressState: "Maharashtra",
    addressCity: "Pune",
    addressPincode: "411001",
    assignedState: "Maharashtra",
    bankAccountNumber: "1234567890",
    ifscCode: "SBIN0001234",
    accountHolderName: "Arjun Kumar",
  },
  {
    userEmail: "engineer2@system.com",
    referenceId: "ENG-002",
    addressState: "Karnataka",
    addressCity: "Bengaluru",
    addressPincode: "560002",
    assignedState: "Karnataka",
    bankAccountNumber: "2345678901",
    ifscCode: "HDFC0002345",
    accountHolderName: "Mohammed Ali",
  },
  {
    userEmail: "engineer3@system.com",
    referenceId: "ENG-003",
    addressState: "Tamil Nadu",
    addressCity: "Chennai",
    addressPincode: "600002",
    assignedState: "Tamil Nadu",
    bankAccountNumber: "3456789012",
    ifscCode: "ICIC0003456",
    accountHolderName: "Deepa Nair",
  },
  {
    userEmail: "engineer4@system.com",
    referenceId: "ENG-004",
    addressState: "Delhi",
    addressCity: "New Delhi",
    addressPincode: "110001",
    assignedState: "Delhi",
    bankAccountNumber: "4567890123",
    ifscCode: "AXIS0004567",
    accountHolderName: "Ravi Patel",
  },
  {
    userEmail: "engineer5@system.com",
    referenceId: "ENG-005",
    addressState: "Gujarat",
    addressCity: "Ahmedabad",
    addressPincode: "380001",
    assignedState: "Gujarat",
    bankAccountNumber: "5678901234",
    ifscCode: "KOTAK0005678",
    accountHolderName: "Kavya Reddy",
  },
];

export async function seedEngineerProfiles(userIdMap: Record<string, string>): Promise<{
  created: string[];
  skipped: string[];
}> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const profile of SEED_ENGINEER_PROFILES) {
    const userId = userIdMap[profile.userEmail];
    if (!userId) continue;

    const [existing] = await db
      .select({ id: engineerProfiles.id })
      .from(engineerProfiles)
      .where(and(eq(engineerProfiles.userId, userId), eq(engineerProfiles.deleted, false)));

    if (existing) {
      skipped.push(profile.referenceId);
      continue;
    }

    await db.insert(engineerProfiles).values({
      userId,
      referenceId: profile.referenceId,
      addressState: profile.addressState,
      addressCity: profile.addressCity,
      addressPincode: profile.addressPincode,
      assignedState: profile.assignedState,
      documentsStatus: "approved",
      bankAccountNumber: profile.bankAccountNumber,
      ifscCode: profile.ifscCode,
      accountHolderName: profile.accountHolderName,
      author: "seed",
    });

    created.push(profile.referenceId);
  }

  return { created, skipped };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

type SeedProject = {
  name: string;
  customerRef: string;
  projectHeadEmail: string;
};

const SEED_PROJECTS: SeedProject[] = [
  { name: "TechCorp Mumbai Network Rollout", customerRef: "CUST-001", projectHeadEmail: "project@system.com" },
  { name: "TechCorp Pune Expansion", customerRef: "CUST-001", projectHeadEmail: "project2@system.com" },
  { name: "GlobalNet Bengaluru Infrastructure", customerRef: "CUST-002", projectHeadEmail: "project@system.com" },
  { name: "GlobalNet Mysuru Site Deployment", customerRef: "CUST-002", projectHeadEmail: "project2@system.com" },
  { name: "CloudEdge Chennai Data Centre", customerRef: "CUST-003", projectHeadEmail: "project@system.com" },
];

export async function seedProjects(
  customerIdMap: Record<string, string>,
  userIdMap: Record<string, string>,
): Promise<{
  created: string[];
  skipped: string[];
  projectIdMap: Record<string, string>;
}> {
  const created: string[] = [];
  const skipped: string[] = [];
  const projectIdMap: Record<string, string> = {};

  for (const proj of SEED_PROJECTS) {
    const customerId = customerIdMap[proj.customerRef];
    const projectHeadId = userIdMap[proj.projectHeadEmail];
    if (!customerId) continue;

    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.name, proj.name), eq(projects.deleted, false)));

    if (existing) {
      projectIdMap[proj.name] = existing.id;
      skipped.push(proj.name);
      continue;
    }

    const [created_] = await db
      .insert(projects)
      .values({ name: proj.name, customerId, projectHeadId, author: "seed" })
      .returning({ id: projects.id });

    projectIdMap[proj.name] = created_.id;
    created.push(proj.name);
  }

  return { created, skipped, projectIdMap };
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

type SeedTicket = {
  ticketNumber: string;
  projectName: string;
  categoryName: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  state: string;
  city: string;
  pincode: string;
  address: string;
  assignedEngineerEmail?: string;
  assignedStatePlannerEmail?: string;
  escalationLevel?: string;
  payoutAmount?: number;
  slaDeadline?: Date;
  closedAt?: Date;
};

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

const SEED_TICKETS: SeedTicket[] = [
  // TechCorp Mumbai — mix of statuses
  {
    ticketNumber: "TKT-0001",
    projectName: "TechCorp Mumbai Network Rollout",
    categoryName: "Network Installation",
    title: "Install LAN cabling at Andheri East office",
    description: "Customer requires structured LAN cabling across 3 floors at Andheri East. Approx 60 nodes.",
    priority: "high",
    status: "closed",
    state: "Maharashtra",
    city: "Mumbai",
    pincode: "400069",
    address: "Plot 12, MIDC Industrial Area, Andheri East, Mumbai",
    assignedEngineerEmail: "engineer@system.com",
    assignedStatePlannerEmail: "planner@system.com",
    payoutAmount: 2500,
    slaDeadline: daysAgo(10),
    closedAt: daysAgo(8),
  },
  {
    ticketNumber: "TKT-0002",
    projectName: "TechCorp Mumbai Network Rollout",
    categoryName: "Router Configuration",
    title: "Configure Cisco routers at BKC data centre",
    description: "Setup BGP routing and VLAN segmentation on 4 Cisco 4331 routers.",
    priority: "high",
    status: "resolved",
    state: "Maharashtra",
    city: "Mumbai",
    pincode: "400051",
    address: "Unit 4B, BKC Corporate Park, Bandra Kurla Complex",
    assignedEngineerEmail: "engineer2@system.com",
    assignedStatePlannerEmail: "planner@system.com",
    payoutAmount: 2000,
    slaDeadline: daysAgo(3),
  },
  {
    ticketNumber: "TKT-0003",
    projectName: "TechCorp Mumbai Network Rollout",
    categoryName: "Fibre Splicing",
    title: "Fibre splicing at Powai interconnect node",
    description: "48-core fibre splicing required at main aggregation point. ODF termination pending.",
    priority: "critical",
    status: "in_progress",
    state: "Maharashtra",
    city: "Mumbai",
    pincode: "400076",
    address: "Hiranandani Business Park, Powai, Mumbai",
    assignedEngineerEmail: "engineer@system.com",
    assignedStatePlannerEmail: "planner@system.com",
    escalationLevel: "L2",
    payoutAmount: 3500,
    slaDeadline: daysFromNow(1),
  },
  {
    ticketNumber: "TKT-0004",
    projectName: "TechCorp Pune Expansion",
    categoryName: "Site Survey",
    title: "Pre-installation site survey — Hinjewadi Phase 3",
    description: "Survey required before equipment installation. Document cable routes, power points and rack space.",
    priority: "medium",
    status: "open",
    state: "Maharashtra",
    city: "Pune",
    pincode: "411057",
    address: "Building 7, Hinjewadi Phase 3 IT Park, Pune",
  },
  {
    ticketNumber: "TKT-0005",
    projectName: "TechCorp Pune Expansion",
    categoryName: "Hardware Replacement",
    title: "Replace faulty UPS units at Kothrud branch",
    description: "3 APC Smart-UPS 3000VA units failed self-test. Replacement and load testing needed.",
    priority: "high",
    status: "assigned",
    state: "Maharashtra",
    city: "Pune",
    pincode: "411038",
    address: "Sai Arcade, Karve Road, Kothrud, Pune",
    assignedEngineerEmail: "engineer@system.com",
    assignedStatePlannerEmail: "planner@system.com",
    payoutAmount: 3000,
    slaDeadline: daysFromNow(2),
  },
  // GlobalNet Bengaluru
  {
    ticketNumber: "TKT-0006",
    projectName: "GlobalNet Bengaluru Infrastructure",
    categoryName: "Network Installation",
    title: "Core network setup at Whitefield campus",
    description: "Install core switches, access layer and patch panels across 5 buildings in the campus.",
    priority: "critical",
    status: "closed",
    state: "Karnataka",
    city: "Bengaluru",
    pincode: "560066",
    address: "EPIP Zone, Whitefield, Bengaluru",
    assignedEngineerEmail: "engineer2@system.com",
    assignedStatePlannerEmail: "planner2@system.com",
    payoutAmount: 2500,
    slaDeadline: daysAgo(15),
    closedAt: daysAgo(12),
  },
  {
    ticketNumber: "TKT-0007",
    projectName: "GlobalNet Bengaluru Infrastructure",
    categoryName: "Preventive Maintenance",
    title: "Quarterly PM visit — Electronic City NOC",
    description: "Scheduled preventive maintenance for network equipment, UPS batteries, and air conditioners.",
    priority: "low",
    status: "closed",
    state: "Karnataka",
    city: "Bengaluru",
    pincode: "560100",
    address: "Electronic City Phase 1, Bengaluru",
    assignedEngineerEmail: "engineer3@system.com",
    assignedStatePlannerEmail: "planner2@system.com",
    payoutAmount: 2000,
    slaDeadline: daysAgo(5),
    closedAt: daysAgo(4),
  },
  {
    ticketNumber: "TKT-0008",
    projectName: "GlobalNet Bengaluru Infrastructure",
    categoryName: "Software Configuration",
    title: "NMS configuration for new network segment",
    description: "Add 120 new nodes to the existing NMS (PRTG). Configure SNMP traps and alerting thresholds.",
    priority: "medium",
    status: "in_progress",
    state: "Karnataka",
    city: "Bengaluru",
    pincode: "560001",
    address: "MG Road Corporate Tower, Bengaluru",
    assignedEngineerEmail: "engineer2@system.com",
    assignedStatePlannerEmail: "planner2@system.com",
    payoutAmount: 1500,
    slaDeadline: daysFromNow(3),
  },
  {
    ticketNumber: "TKT-0009",
    projectName: "GlobalNet Mysuru Site Deployment",
    categoryName: "Site Survey",
    title: "New site survey — Mysuru Industrial Area",
    description: "Survey for new greenfield site deployment in Mysuru. Client requires network and power assessment.",
    priority: "medium",
    status: "open",
    state: "Karnataka",
    city: "Mysuru",
    pincode: "570016",
    address: "Hootagalli Industrial Area, Mysuru",
  },
  {
    ticketNumber: "TKT-0010",
    projectName: "GlobalNet Mysuru Site Deployment",
    categoryName: "Fibre Splicing",
    title: "Last-mile fibre termination at Mysuru depot",
    description: "Terminate 24-core fibre from backhaul to client premises. Install OFC distribution box.",
    priority: "high",
    status: "escalated_l3",
    state: "Karnataka",
    city: "Mysuru",
    pincode: "570001",
    address: "Sayyaji Rao Road, Mysuru",
    assignedEngineerEmail: "engineer3@system.com",
    assignedStatePlannerEmail: "planner2@system.com",
    escalationLevel: "L3",
    payoutAmount: 3500,
    slaDeadline: daysAgo(1),
  },
  // CloudEdge Chennai
  {
    ticketNumber: "TKT-0011",
    projectName: "CloudEdge Chennai Data Centre",
    categoryName: "Network Installation",
    title: "Spine-leaf architecture deployment at OMR DC",
    description: "Deploy Juniper spine-leaf fabric. 4 spine switches, 12 leaf switches. BGP EVPN configuration.",
    priority: "critical",
    status: "in_progress",
    state: "Tamil Nadu",
    city: "Chennai",
    pincode: "600119",
    address: "OMR IT Corridor, Sholinganallur, Chennai",
    assignedEngineerEmail: "engineer4@system.com",
    assignedStatePlannerEmail: "planner@system.com",
    escalationLevel: "L1",
    payoutAmount: 2500,
    slaDeadline: daysFromNow(5),
  },
  {
    ticketNumber: "TKT-0012",
    projectName: "CloudEdge Chennai Data Centre",
    categoryName: "Hardware Replacement",
    title: "Replace failed storage controller — Rack C-04",
    description: "NetApp AFF A220 controller module failure. Replacement and LUN migration required.",
    priority: "critical",
    status: "resolved",
    state: "Tamil Nadu",
    city: "Chennai",
    pincode: "600119",
    address: "OMR IT Corridor, Sholinganallur, Chennai",
    assignedEngineerEmail: "engineer5@system.com",
    assignedStatePlannerEmail: "planner@system.com",
    payoutAmount: 3000,
    slaDeadline: daysAgo(2),
  },
  {
    ticketNumber: "TKT-0013",
    projectName: "CloudEdge Chennai Data Centre",
    categoryName: "Software Configuration",
    title: "Firewall policy hardening — Palo Alto cluster",
    description: "Apply new security policy set per client audit findings. 47 rule changes across 3 vsys.",
    priority: "high",
    status: "assigned",
    state: "Tamil Nadu",
    city: "Chennai",
    pincode: "600119",
    address: "OMR IT Corridor, Sholinganallur, Chennai",
    assignedEngineerEmail: "engineer4@system.com",
    assignedStatePlannerEmail: "planner@system.com",
    payoutAmount: 1500,
    slaDeadline: daysFromNow(4),
  },
  {
    ticketNumber: "TKT-0014",
    projectName: "CloudEdge Chennai Data Centre",
    categoryName: "Preventive Maintenance",
    title: "Monthly PM — UPS and generator",
    description: "Load bank testing, battery health check, and generator run test for 2MW UPS system.",
    priority: "medium",
    status: "open",
    state: "Tamil Nadu",
    city: "Chennai",
    pincode: "600119",
    address: "OMR IT Corridor, Sholinganallur, Chennai",
  },
  {
    ticketNumber: "TKT-0015",
    projectName: "TechCorp Mumbai Network Rollout",
    categoryName: "Hardware Replacement",
    title: "Replace access switches at Worli office",
    description: "4 HP Aruba 2930F switches end-of-life. Replacement with 2930M and reconfiguration.",
    priority: "medium",
    status: "open",
    state: "Maharashtra",
    city: "Mumbai",
    pincode: "400018",
    address: "Peninsula Corporate Park, Worli, Mumbai",
  },
];

export async function seedTickets(
  projectIdMap: Record<string, string>,
  categoryIdMap: Record<string, string>,
  userIdMap: Record<string, string>,
): Promise<{
  created: string[];
  skipped: string[];
  ticketIdMap: Record<string, string>;
}> {
  const created: string[] = [];
  const skipped: string[] = [];
  const ticketIdMap: Record<string, string> = {};

  for (const t of SEED_TICKETS) {
    const projectId = projectIdMap[t.projectName];
    const categoryId = categoryIdMap[t.categoryName];
    if (!projectId) continue;

    const [existing] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.ticketNumber, t.ticketNumber), eq(tickets.deleted, false)));

    if (existing) {
      ticketIdMap[t.ticketNumber] = existing.id;
      skipped.push(t.ticketNumber);
      continue;
    }

    const assignedEngineerId = t.assignedEngineerEmail ? userIdMap[t.assignedEngineerEmail] : undefined;
    const assignedStatePlannerId = t.assignedStatePlannerEmail
      ? userIdMap[t.assignedStatePlannerEmail]
      : undefined;

    const [created_] = await db
      .insert(tickets)
      .values({
        ticketNumber: t.ticketNumber,
        projectId,
        categoryId,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        state: t.state,
        city: t.city,
        pincode: t.pincode,
        address: t.address,
        assignedEngineerId,
        assignedStatePlannerId,
        escalationLevel: t.escalationLevel,
        payoutAmount: t.payoutAmount,
        slaDeadline: t.slaDeadline,
        closedAt: t.closedAt,
        author: "seed",
      })
      .returning({ id: tickets.id });

    ticketIdMap[t.ticketNumber] = created_.id;
    created.push(t.ticketNumber);
  }

  return { created, skipped, ticketIdMap };
}

// ---------------------------------------------------------------------------
// Ticket History
// ---------------------------------------------------------------------------

type SeedHistory = {
  ticketNumber: string;
  action: string;
  status: string;
  remarks: string;
  authorEmail: string;
  createdAt: Date;
};

const SEED_HISTORY: SeedHistory[] = [
  // TKT-0001 (closed)
  { ticketNumber: "TKT-0001", action: "created", status: "open", remarks: "Ticket raised by customer.", authorEmail: "customer@system.com", createdAt: daysAgo(18) },
  { ticketNumber: "TKT-0001", action: "assigned", status: "assigned", remarks: "Assigned to Arjun Kumar.", authorEmail: "planner@system.com", createdAt: daysAgo(17) },
  { ticketNumber: "TKT-0001", action: "in_progress", status: "in_progress", remarks: "Engineer on-site. Cabling work started.", authorEmail: "engineer@system.com", createdAt: daysAgo(15) },
  { ticketNumber: "TKT-0001", action: "resolved", status: "resolved", remarks: "LAN cabling completed. 60 nodes tested and live.", authorEmail: "engineer@system.com", createdAt: daysAgo(10) },
  { ticketNumber: "TKT-0001", action: "closed", status: "closed", remarks: "Customer confirmed sign-off. Payout processed.", authorEmail: "noc@system.com", createdAt: daysAgo(8) },
  // TKT-0002 (resolved)
  { ticketNumber: "TKT-0002", action: "created", status: "open", remarks: "Router configuration request raised.", authorEmail: "customer@system.com", createdAt: daysAgo(12) },
  { ticketNumber: "TKT-0002", action: "assigned", status: "assigned", remarks: "Assigned to Mohammed Ali.", authorEmail: "planner@system.com", createdAt: daysAgo(11) },
  { ticketNumber: "TKT-0002", action: "in_progress", status: "in_progress", remarks: "BGP configuration applied on 2/4 routers.", authorEmail: "engineer2@system.com", createdAt: daysAgo(7) },
  { ticketNumber: "TKT-0002", action: "resolved", status: "resolved", remarks: "All 4 routers configured. Routing tables verified.", authorEmail: "engineer2@system.com", createdAt: daysAgo(3) },
  // TKT-0003 (in_progress, escalated)
  { ticketNumber: "TKT-0003", action: "created", status: "open", remarks: "Urgent fibre splicing required due to cable cut.", authorEmail: "customer@system.com", createdAt: daysAgo(4) },
  { ticketNumber: "TKT-0003", action: "assigned", status: "assigned", remarks: "Assigned to Arjun Kumar on priority.", authorEmail: "planner@system.com", createdAt: daysAgo(4) },
  { ticketNumber: "TKT-0003", action: "escalated", status: "in_progress", remarks: "SLA at risk. Escalated to L2. Awaiting splice kit delivery.", authorEmail: "noc@system.com", createdAt: daysAgo(2) },
  // TKT-0005 (assigned)
  { ticketNumber: "TKT-0005", action: "created", status: "open", remarks: "UPS failures reported. Power at risk.", authorEmail: "customer@system.com", createdAt: daysAgo(3) },
  { ticketNumber: "TKT-0005", action: "assigned", status: "assigned", remarks: "Assigned to Arjun Kumar. Site visit scheduled.", authorEmail: "planner@system.com", createdAt: daysAgo(2) },
  // TKT-0006 (closed)
  { ticketNumber: "TKT-0006", action: "created", status: "open", remarks: "Core network setup initiated for Whitefield campus.", authorEmail: "customer2@system.com", createdAt: daysAgo(25) },
  { ticketNumber: "TKT-0006", action: "assigned", status: "assigned", remarks: "Assigned to Mohammed Ali.", authorEmail: "planner2@system.com", createdAt: daysAgo(24) },
  { ticketNumber: "TKT-0006", action: "in_progress", status: "in_progress", remarks: "Core switches racked and cabled. Config in progress.", authorEmail: "engineer2@system.com", createdAt: daysAgo(20) },
  { ticketNumber: "TKT-0006", action: "resolved", status: "resolved", remarks: "All buildings live. Traffic flowing across campus.", authorEmail: "engineer2@system.com", createdAt: daysAgo(15) },
  { ticketNumber: "TKT-0006", action: "closed", status: "closed", remarks: "Customer acceptance obtained.", authorEmail: "noc@system.com", createdAt: daysAgo(12) },
  // TKT-0007 (closed)
  { ticketNumber: "TKT-0007", action: "created", status: "open", remarks: "Quarterly PM scheduled.", authorEmail: "noc@system.com", createdAt: daysAgo(10) },
  { ticketNumber: "TKT-0007", action: "assigned", status: "assigned", remarks: "Assigned to Deepa Nair.", authorEmail: "planner2@system.com", createdAt: daysAgo(9) },
  { ticketNumber: "TKT-0007", action: "resolved", status: "resolved", remarks: "PM completed. All equipment healthy. Report submitted.", authorEmail: "engineer3@system.com", createdAt: daysAgo(5) },
  { ticketNumber: "TKT-0007", action: "closed", status: "closed", remarks: "PM report reviewed and archived.", authorEmail: "noc@system.com", createdAt: daysAgo(4) },
  // TKT-0008 (in_progress)
  { ticketNumber: "TKT-0008", action: "created", status: "open", remarks: "NMS expansion requested for new segment.", authorEmail: "customer2@system.com", createdAt: daysAgo(5) },
  { ticketNumber: "TKT-0008", action: "assigned", status: "assigned", remarks: "Assigned to Mohammed Ali.", authorEmail: "planner2@system.com", createdAt: daysAgo(4) },
  { ticketNumber: "TKT-0008", action: "in_progress", status: "in_progress", remarks: "80/120 nodes added to PRTG. SNMP traps configured.", authorEmail: "engineer2@system.com", createdAt: daysAgo(2) },
  // TKT-0010 (escalated)
  { ticketNumber: "TKT-0010", action: "created", status: "open", remarks: "Last-mile fibre termination required.", authorEmail: "customer2@system.com", createdAt: daysAgo(6) },
  { ticketNumber: "TKT-0010", action: "assigned", status: "assigned", remarks: "Assigned to Deepa Nair.", authorEmail: "planner2@system.com", createdAt: daysAgo(5) },
  { ticketNumber: "TKT-0010", action: "escalated_l3", status: "escalated_l3", remarks: "SLA breached. Escalated to L3 management review. Contractor delay cited.", authorEmail: "admin@system.com", createdAt: daysAgo(1) },
  // TKT-0011 (in_progress)
  { ticketNumber: "TKT-0011", action: "created", status: "open", remarks: "DC fabric deployment kickoff.", authorEmail: "customer3@system.com", createdAt: daysAgo(8) },
  { ticketNumber: "TKT-0011", action: "assigned", status: "assigned", remarks: "Assigned to Ravi Patel.", authorEmail: "planner@system.com", createdAt: daysAgo(7) },
  { ticketNumber: "TKT-0011", action: "in_progress", status: "in_progress", remarks: "Spine switches deployed. Leaf layer 60% complete.", authorEmail: "engineer4@system.com", createdAt: daysAgo(3) },
  // TKT-0012 (resolved)
  { ticketNumber: "TKT-0012", action: "created", status: "open", remarks: "Critical storage failure. Production impact.", authorEmail: "customer3@system.com", createdAt: daysAgo(4) },
  { ticketNumber: "TKT-0012", action: "assigned", status: "assigned", remarks: "P1 — assigned to Kavya Reddy immediately.", authorEmail: "admin@system.com", createdAt: daysAgo(4) },
  { ticketNumber: "TKT-0012", action: "in_progress", status: "in_progress", remarks: "Replacement controller received. LUN migration started.", authorEmail: "engineer5@system.com", createdAt: daysAgo(3) },
  { ticketNumber: "TKT-0012", action: "resolved", status: "resolved", remarks: "Controller replaced. All LUNs verified accessible.", authorEmail: "engineer5@system.com", createdAt: daysAgo(2) },
  // TKT-0013 (assigned)
  { ticketNumber: "TKT-0013", action: "created", status: "open", remarks: "Firewall hardening required post security audit.", authorEmail: "customer3@system.com", createdAt: daysAgo(3) },
  { ticketNumber: "TKT-0013", action: "assigned", status: "assigned", remarks: "Assigned to Ravi Patel. Change window: next Saturday.", authorEmail: "planner@system.com", createdAt: daysAgo(2) },
];

export async function seedTicketHistory(
  ticketIdMap: Record<string, string>,
  userIdMap: Record<string, string>,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const h of SEED_HISTORY) {
    const ticketId = ticketIdMap[h.ticketNumber];
    if (!ticketId) continue;

    const authorId = userIdMap[h.authorEmail];

    const [existing] = await db
      .select({ id: ticketHistory.id })
      .from(ticketHistory)
      .where(
        and(
          eq(ticketHistory.ticketId, ticketId),
          eq(ticketHistory.action, h.action),
          eq(ticketHistory.status, h.status),
        ),
      );

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(ticketHistory).values({
      ticketId,
      action: h.action,
      status: h.status,
      remarks: h.remarks,
      authorId,
      author: "seed",
    });

    created++;
  }

  return { created, skipped };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

type SeedAttachment = {
  ticketNumber: string;
  type: string;
  fileUrl: string;
  uploadedByEmail: string;
};

const SEED_ATTACHMENTS: SeedAttachment[] = [
  { ticketNumber: "TKT-0001", type: "site_photo", fileUrl: "/uploads/demo/tkt-0001-site-photo.jpg", uploadedByEmail: "engineer@system.com" },
  { ticketNumber: "TKT-0001", type: "completion_report", fileUrl: "/uploads/demo/tkt-0001-report.pdf", uploadedByEmail: "engineer@system.com" },
  { ticketNumber: "TKT-0002", type: "configuration_backup", fileUrl: "/uploads/demo/tkt-0002-config.txt", uploadedByEmail: "engineer2@system.com" },
  { ticketNumber: "TKT-0003", type: "site_photo", fileUrl: "/uploads/demo/tkt-0003-splice-photo.jpg", uploadedByEmail: "engineer@system.com" },
  { ticketNumber: "TKT-0006", type: "site_photo", fileUrl: "/uploads/demo/tkt-0006-campus.jpg", uploadedByEmail: "engineer2@system.com" },
  { ticketNumber: "TKT-0006", type: "completion_report", fileUrl: "/uploads/demo/tkt-0006-report.pdf", uploadedByEmail: "engineer2@system.com" },
  { ticketNumber: "TKT-0007", type: "pm_report", fileUrl: "/uploads/demo/tkt-0007-pm-report.pdf", uploadedByEmail: "engineer3@system.com" },
  { ticketNumber: "TKT-0010", type: "site_photo", fileUrl: "/uploads/demo/tkt-0010-fibre.jpg", uploadedByEmail: "engineer3@system.com" },
  { ticketNumber: "TKT-0011", type: "network_diagram", fileUrl: "/uploads/demo/tkt-0011-topology.pdf", uploadedByEmail: "engineer4@system.com" },
  { ticketNumber: "TKT-0012", type: "site_photo", fileUrl: "/uploads/demo/tkt-0012-controller.jpg", uploadedByEmail: "engineer5@system.com" },
  { ticketNumber: "TKT-0012", type: "completion_report", fileUrl: "/uploads/demo/tkt-0012-report.pdf", uploadedByEmail: "engineer5@system.com" },
  { ticketNumber: "TKT-0013", type: "audit_report", fileUrl: "/uploads/demo/tkt-0013-audit.pdf", uploadedByEmail: "customer3@system.com" },
];

export async function seedAttachments(
  ticketIdMap: Record<string, string>,
  userIdMap: Record<string, string>,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const att of SEED_ATTACHMENTS) {
    const ticketId = ticketIdMap[att.ticketNumber];
    if (!ticketId) continue;

    const uploadedBy = userIdMap[att.uploadedByEmail];

    const [existing] = await db
      .select({ id: attachments.id })
      .from(attachments)
      .where(
        and(
          eq(attachments.ticketId, ticketId),
          eq(attachments.fileUrl, att.fileUrl),
        ),
      );

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(attachments).values({
      ticketId,
      type: att.type,
      fileUrl: att.fileUrl,
      uploadedBy,
      uploadedAt: new Date(),
      author: "seed",
    });

    created++;
  }

  return { created, skipped };
}

// ---------------------------------------------------------------------------
// Inventory Items
// ---------------------------------------------------------------------------

type SeedInventoryItem = {
  name: string;
  sku: string;
  quantity: number;
  location: string;
};

const SEED_INVENTORY_ITEMS: SeedInventoryItem[] = [
  { name: "CAT6 Ethernet Cable (1m)", sku: "CBL-CAT6-1M", quantity: 500, location: "Warehouse A - Shelf 1" },
  { name: "CAT6 Ethernet Cable (3m)", sku: "CBL-CAT6-3M", quantity: 300, location: "Warehouse A - Shelf 1" },
  { name: "CAT6 Ethernet Cable (5m)", sku: "CBL-CAT6-5M", quantity: 200, location: "Warehouse A - Shelf 2" },
  { name: "RJ45 Crimp Connector", sku: "CONN-RJ45", quantity: 2000, location: "Warehouse A - Shelf 2" },
  { name: "24-Port Patch Panel", sku: "PP-24P", quantity: 40, location: "Warehouse A - Rack Storage" },
  { name: "48-Port Patch Panel", sku: "PP-48P", quantity: 20, location: "Warehouse A - Rack Storage" },
  { name: "Cisco SFP+ 10G SR Transceiver", sku: "SFP-10G-SR", quantity: 80, location: "Warehouse B - Shelf 1" },
  { name: "Cisco SFP 1G LX Transceiver", sku: "SFP-1G-LX", quantity: 60, location: "Warehouse B - Shelf 1" },
  { name: "Fibre Optic Splice Cassette (12-core)", sku: "FOC-SPL-12", quantity: 25, location: "Warehouse B - Shelf 2" },
  { name: "Fibre Optic Pigtail LC/UPC (SM)", sku: "FOC-PIG-LC-SM", quantity: 150, location: "Warehouse B - Shelf 2" },
  { name: "Fibre Distribution Frame (1U 12-port)", sku: "FDF-1U-12", quantity: 30, location: "Warehouse B - Rack" },
  { name: "APC Smart-UPS 1500VA", sku: "UPS-APC-1500", quantity: 15, location: "Warehouse C - Floor Area" },
  { name: "APC Smart-UPS 3000VA", sku: "UPS-APC-3000", quantity: 8, location: "Warehouse C - Floor Area" },
  { name: "APC UPS Replacement Battery (RBC55)", sku: "UPS-BAT-RBC55", quantity: 40, location: "Warehouse C - Shelf 1" },
  { name: "19-inch Server Rack (42U)", sku: "RACK-42U", quantity: 6, location: "Warehouse C - Floor Area" },
  { name: "Cable Management Tray (1U)", sku: "CMT-1U", quantity: 100, location: "Warehouse A - Shelf 3" },
  { name: "Velcro Cable Tie Roll (10m)", sku: "TIE-VLR-10M", quantity: 200, location: "Warehouse A - Shelf 3" },
  { name: "Network Label Tape (Brother TZe)", sku: "LBL-TZE-9", quantity: 50, location: "Warehouse A - Shelf 4" },
  { name: "Cisco Catalyst 2960-X 48-port Switch", sku: "SW-C2960X-48", quantity: 10, location: "Warehouse B - Secure Store" },
  { name: "HP Aruba 2930F 24G Switch", sku: "SW-ARUBA-2930F-24", quantity: 8, location: "Warehouse B - Secure Store" },
  { name: "Patchcord LC-LC Duplex SM 10m", sku: "FOC-PC-LCLC-SM-10", quantity: 60, location: "Warehouse B - Shelf 3" },
  { name: "Power Strip (6-outlet, 1.5m)", sku: "PWR-STRIP-6", quantity: 70, location: "Warehouse A - Shelf 5" },
  { name: "OTDR Test Set (rental unit)", sku: "TST-OTDR-01", quantity: 3, location: "Testing Lab" },
  { name: "Network Cable Tester (Fluke MicroScanner)", sku: "TST-FLUKE-MS", quantity: 5, location: "Testing Lab" },
];

export async function seedInventoryItems(): Promise<{
  created: string[];
  skipped: string[];
  itemIdMap: Record<string, string>;
}> {
  const created: string[] = [];
  const skipped: string[] = [];
  const itemIdMap: Record<string, string> = {};

  for (const item of SEED_INVENTORY_ITEMS) {
    const [existing] = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(eq(inventoryItems.sku, item.sku));

    if (existing) {
      itemIdMap[item.sku] = existing.id;
      skipped.push(item.sku);
      continue;
    }

    const [created_] = await db
      .insert(inventoryItems)
      .values({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        location: item.location,
      })
      .returning({ id: inventoryItems.id });

    itemIdMap[item.sku] = created_.id;
    created.push(item.sku);
  }

  return { created, skipped, itemIdMap };
}

export async function seedInventoryTransactions(
  itemIdMap: Record<string, string>,
  adminUserId: string,
): Promise<{ created: number }> {
  let created = 0;

  for (const item of SEED_INVENTORY_ITEMS) {
    const itemId = itemIdMap[item.sku];
    if (!itemId) continue;

    const [existing] = await db
      .select({ id: inventoryTransactions.id })
      .from(inventoryTransactions)
      .where(and(eq(inventoryTransactions.itemId, itemId), eq(inventoryTransactions.type, "IN")));

    if (existing) continue;

    await db.insert(inventoryTransactions).values({
      itemId,
      type: "IN",
      quantity: item.quantity,
      userId: adminUserId,
      remarks: "Initial stock — seed",
    });

    created++;
  }

  return { created };
}
