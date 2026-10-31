// ─── The hub's tools ─────────────────────────────────────────────────────────
// To add a tool: build it in src/tools/<name>/, then add one entry here.
//   id         URL + tile key (#/<id>)
//   fullScreen tool draws its own layout (otherwise it's wrapped in the hub header)
//   adminOnly  hide the tile from field crew
import TimeCardTool from "./timecard/TimeCard.jsx"
import JobsTool from "./jobs/JobsTool.jsx"
import Announcements from "./announcements/Announcements.jsx"
import Resources from "./resources/Resources.jsx"
import Crew from "./crew/Crew.jsx"
import Schedule from "./schedule/Schedule.jsx"
import TimeOff from "./timeoff/TimeOff.jsx"

export const TOOLS = [
  { id: "timecard",      name: "TimeCard",      icon: "clock",     desc: "Clock in and out, timecards, T&M sheets", component: TimeCardTool, fullScreen: true },
  { id: "schedule",      name: "Schedule",      icon: "calendar",  desc: "Who's on which job this week",            component: Schedule },
  { id: "jobs",          name: "Jobs",          icon: "briefcase", desc: "Job info, progress photos, and updates",  component: JobsTool },
  { id: "announcements", name: "Announcements", icon: "megaphone", desc: "Company news and reminders",              component: Announcements },
  { id: "resources",     name: "Resources",     icon: "folder",    desc: "Safety docs, forms, spec sheets, links",  component: Resources },
  { id: "timeoff",       name: "Time Off",      icon: "sun",       desc: "Request days off, see approvals",         component: TimeOff },
  { id: "crew",          name: "The Crew",      icon: "users",     desc: "Profiles, birthdays, who's who",          component: Crew },
]
