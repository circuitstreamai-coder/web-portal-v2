export interface CreateProjectBody {
  customerId: string;
  name: string;
  projectHeadId?: string;
  author?: string;
}

export interface AssignHeadBody {
  projectHeadId: string;
}

export interface UpdateProjectBody {
  name?: string;
  projectHeadId?: string;
}
