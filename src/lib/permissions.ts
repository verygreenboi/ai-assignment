/**
 * The permission model — spec §2.3. Two pure functions, and nothing else in
 * the codebase decides access. A `ownerId === userId` comparison anywhere
 * outside this file is a bug.
 */

export type Role = "owner" | "editor" | "viewer";
export type Capability = "read" | "write" | "share";

type DocumentLike = { ownerId: string };
type ShareLike = { userId: string; role: string };

/** The caller's role on a document, or null when they have no relationship. */
export function resolveRole(
  userId: string,
  document: DocumentLike,
  share: ShareLike | null,
): Role | null {
  if (document.ownerId === userId) {
    return "owner";
  }

  if (share && share.userId === userId) {
    return share.role === "editor" ? "editor" : "viewer";
  }

  return null;
}

/** Whether a role carries a capability. */
export function can(role: Role | null, capability: Capability): boolean {
  if (role === null) {
    return false;
  }

  switch (capability) {
    case "read":
      return true;
    case "write":
      return role === "owner" || role === "editor";
    case "share":
      return role === "owner";
  }
}
