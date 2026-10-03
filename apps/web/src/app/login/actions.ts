"use server";

import { redirect } from "next/navigation";

import { startSession } from "@/lib/auth";
import { loginWithApi } from "@/lib/auth-api";
import { performLogin, type LoginState } from "@/lib/login";

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const state = await performLogin(formData, { login: loginWithApi, startSession });
  if (state) return state;
  redirect("/");
}
