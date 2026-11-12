// ─── The hub's tools ─────────────────────────────────────────────────────────
// To add a tool: build it in src/tools/<name>/, then add one entry here.
//   id         URL + tile key (#/<id>)
//   fullScreen tool draws its own layout (otherwise it's wrapped in the hub header)
//   adminOnly  hide the tile from field crew
//   superOnly  only the super admin (Jacob) sees it
import TimeCardTool from "./timecard/TimeCard.jsx"
import JobsTool from "./jobs/JobsTool.jsx"
import Announcements from "./announcements/Announcements.jsx"
import Resources from "./resources/Resources.jsx"
import Crew from "./crew/Crew.jsx"
import Schedule from "./schedule/Schedule.jsx"
import TimeOff from "./timeoff/TimeOff.jsx"
import Messages from "./messages/Messages.jsx"
import Inventory from "./inventory/Inventory.jsx"
import Users from "./users/Users.jsx"

export const TOOLS = [
  { id: "timecard",      name: "TimeCard",      icon: "clock",     desc: "Clock in and out, timecards, T&M sheets", component: TimeCardTool, fullScreen: true },
  { id: "schedule",      name: "Schedule",      icon: "calendar",  desc: "Who's on which job this week",            component: Schedule },
  { id: "jobs",          name: "Jobs",          icon: "briefcase", desc: "Job info, progress photos, and updates",  component: JobsTool },
  { id: "inventory",     name: "Inventory",     icon: "box",       desc: "Stock, tools, and materials issued to jobs", component: Inventory },
  { id: "messages",      name: "Messages",      icon: "message",   desc: "Crew chat and direct messages",           component: Messages },
  { id: "announcements", name: "Announcements", icon: "megaphone", desc: "Company news and reminders",              component: Announcements },
  { id: "resources",     name: "Resources",     icon: "folder",    desc: "Safety docs, forms, spec sheets, links",  component: Resources },
  { id: "timeoff",       name: "Time Off",      icon: "sun",       desc: "Request days off, see approvals",         component: TimeOff },
  { id: "users",         name: "Users & Logins", icon: "lock",   desc: "Add logins, reset passwords, turn access on or off", component: Users, superOnly: true },
  { id: "crew",          name: "The Crew",      icon: "users",     desc: "Profiles, birthdays, who's who",          component: Crew },
]
