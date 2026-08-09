import { gqlRequest } from "$lib/api/graphql";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string;
  ticketNumber: string;
  projectId: string;
  categoryId: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  state: string;
  city: string;
  pincode: string;
  address: string;
  assignedEngineerId: string;
  statePlannerId: string;
  escalationLevel: string;
  replacementStatus?: 'pending' | 'approved' | 'dispatched' | 'replaced' | 'rejected' | null;
  payoutAmount: number;
  slaDeadline: string;
  author: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface TicketCategory {
  id: string;
  name: string;
  defaultPayout: number;
  author: string;
  createdAt: string;
}

export interface TicketHistory {
  id: string;
  ticketId: string;
  status: string;
  remarks: string;
  author: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  ticketId: string;
  type: string;
  fileUrl: string;
  uploadedAt: string;
  author: string;
  createdAt: string;
}

// ── Queries ─────────────────────────────────────────────────────────────────

const FETCH_TICKETS = `
  query {
    tickets {
      id ticketNumber projectId categoryId title description
      priority status state city pincode address
      assignedEngineerId statePlannerId escalationLevel
      payoutAmount slaDeadline author createdAt
    }
  }
`;

const FETCH_USERS_BY_ROLE = `
  query UsersByRole($role: String!) {
    users(role: $role) {
      id name email role
    }
  }
`;

const FETCH_TICKET_CATEGORIES = `
  query {
    ticketCategories {
      id name defaultPayout author 
    }
  }
`;

// ── Functions ──────────────────────────────────────────────────────────────

export async function fetchTickets(): Promise<Ticket[]> {
  const data = await gqlRequest<{ tickets: Ticket[] }>(FETCH_TICKETS);
  return data.tickets;
}

export async function fetchUsersByRole(role: string): Promise<User[]> {
  const data = await gqlRequest<{ users: User[] }>(FETCH_USERS_BY_ROLE, {
    role,
  });
  return data.users;
}

export async function fetchTicketCategories(): Promise<TicketCategory[]> {
  const data = await gqlRequest<{ ticketCategories: TicketCategory[] }>(
    FETCH_TICKET_CATEGORIES,
  );
  return data.ticketCategories;
}
