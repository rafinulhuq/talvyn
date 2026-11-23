/** The CMP documents an admin can edit. Shared by server and client code. */
export const DOCS: Record<string, { label: string; about: string; preview?: string }> = {
  site: { label: "Site", about: "Page titles, menu, footer and search-engine settings.", preview: "/" },
  home: { label: "Homepage", about: "Every section of the public homepage.", preview: "/" },
  candidate_experience: { label: "Candidate pages", about: "What candidates read on invitation, start and finish pages." },
  invitation_email: { label: "Invitation email", about: "The email candidates receive with their private link." },
};
