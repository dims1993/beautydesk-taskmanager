import {
  Clock,
  Calendar,
  BarChart3,
  Users,
  UserSquare2,
} from "lucide-react";

/** Main app sections — shared by mobile and desktop nav. */
export const APP_MAIN_NAV_TABS = [
  { id: "agenda", icon: Clock, title: "Agenda" },
  { id: "calendario", icon: Calendar, title: "Calendario" },
  { id: "stats", icon: BarChart3, title: "Estadísticas" },
  { id: "equipo", icon: Users, title: "Equipo" },
  { id: "clientes", icon: UserSquare2, title: "Clientes" },
];
