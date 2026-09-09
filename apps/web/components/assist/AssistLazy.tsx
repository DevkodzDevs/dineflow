"use client";
import dynamic from "next/dynamic";
/** Assist is ~40 kB with its animation. It arrives a beat after the screen paints, never before. */
const Assist = dynamic(() => import("./Assist").then((m) => m.Assist), { ssr: false });
export function AssistLazy() { return <Assist />; }
