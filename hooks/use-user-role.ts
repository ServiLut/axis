"use client";

import { useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";

interface DecodedToken {
  userId: number;
  tenantId: number;
  tenantName: string;
  username: string;
  nombre: string;
  apellido: string;
  role: "SU_ADMIN" | "ADMIN" | "ASESOR" | "TECNICO";
  aprobado: boolean;
  exp: number;
}

export function useUserRole() {
  const [userId, setUserId] = useState<number | null>(null);
  const [role, setRole] = useState<"SU_ADMIN" | "ADMIN" | "ASESOR" | "TECNICO" | null>(null);
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [apellido, setApellido] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserRole = () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const decoded = jwtDecode<DecodedToken>(token);
          setUserId(decoded.userId);
          setRole(decoded.role);
          setTenantId(decoded.tenantId);
          setTenantName(decoded.tenantName);
          setUsername(decoded.username);
          setNombre(decoded.nombre);
          setApellido(decoded.apellido);
        } catch (error) {
          console.error("Error decoding token:", error);
          setUserId(null);
          setRole(null);
          setTenantId(null);
          setTenantName(null);
          setUsername(null);
          setNombre(null);
          setApellido(null);
        }
      } else {
        setUserId(null);
        setRole(null);
        setTenantId(null);
        setTenantName(null);
        setUsername(null);
        setNombre(null);
        setApellido(null);
      }
      setLoading(false);
    };

    loadUserRole();
  }, []);

  const userFullName = nombre && apellido ? `${nombre} ${apellido}` : username;

  return { userId, role, tenantId, tenantName, username, nombre, apellido, userFullName, loading };
}
