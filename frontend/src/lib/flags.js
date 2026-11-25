// Switches for parts of Pathwai that are not ready to show yet. Flip one to true to bring that part back.
// MEMBERS_VISIBLE: the People pages, member profiles and member counts. Off while the members area is under construction.
export const MEMBERS_VISIBLE = false;
// COMMUNITIES_VISIBLE: community spaces (switching between them, the Communities page, joining one). Off for now so Pathwai shows on its own with nothing from any community.
export const COMMUNITIES_VISIBLE = process.env.REACT_APP_PREVIEW === "true"; // only the built-in preview shows its sample communities
