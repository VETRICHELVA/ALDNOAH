"use client";
import { createContext, useContext } from "react";
import type { User } from "@/lib/types";

export const MeContext = createContext<User | null>(null);
export const useMe = () => useContext(MeContext);
export const canReview = (u: User | null) => !!u && u.role !== "VIEWER";
export const canManage = (u: User | null) => !!u && (u.role === "ADMIN" || u.role === "FINANCE_MANAGER");
