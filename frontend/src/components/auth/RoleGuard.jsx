import React from "react";
import { Navigate } from "react-router-dom";

// Le pasamos 'user' y 'isLoggedIn' como props desde App.jsx
const RoleGuard = ({ children, allowedRoles, user, isLoggedIn }) => {
  // 1. Si no está logueado, directo al login
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  // 2. Si está logueado pero aún no tenemos los datos del usuario (fetch en proceso)
  if (isLoggedIn && !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8f5f2]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5d5045]"></div>
      </div>
    );
  }

  const userRole = String(user?.role || "").toUpperCase();
  const allowed = allowedRoles.map((r) => String(r || "").toUpperCase());
  if (!allowed.includes(userRole)) {
    return <Navigate to="/app" replace />;
  }

  // 4. Si todo OK, adelante
  return children;
};

export default RoleGuard;
