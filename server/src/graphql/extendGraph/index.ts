import * as users from "./builder/users.js";
import * as roles from "./builder/roles.js";
import * as userRoles from "./builder/userRoles.js";
import * as engineerProfiles from "./builder/engineerProfiles.js";
import * as customers from "./builder/customers.js";
import * as projects from "./builder/projects.js";
import * as tickets from "./builder/tickets.js";
import * as ticketCategories from "./builder/ticketCategories.js";
import * as ticketHistory from "./builder/ticketHistory.js";
import * as attachments from "./builder/attachments.js";
import * as onboarding from "./builder/onboarding.js";

export const builders = [
  users,
  roles,
  userRoles,
  engineerProfiles,
  customers,
  projects,
  tickets,
  ticketCategories,
  ticketHistory,
  attachments,
  onboarding,
];
