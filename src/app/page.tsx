"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.22),transparent_40%),radial-gradient(circle_at_80%_30%,hsl(var(--accent)/0.18),transparent_45%),radial-gradient(circle_at_50%_80%,hsl(var(--primary)/0.15),transparent_40%)]" />

      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-6 py-16 md:px-10"
      >
        <motion.div variants={item} className="space-y-4">
          <Badge className="rounded-full px-3 py-1 text-xs tracking-wide">
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Future Interface Starter
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            Build beautiful web apps directly from your prompts.
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            Next.js + Tailwind + shadcn/ui + Framer Motion are wired and ready. Drop your idea and we can iterate design fast.
          </p>
          <div className="flex gap-3">
            <Button size="lg">Start Building</Button>
            <Button size="lg" variant="outline">
              View Components
            </Button>
          </div>
        </motion.div>

        <motion.div variants={item} className="grid gap-4 md:grid-cols-3">
          {[
            ["Prompt-first", "Describe a product and get a polished UI scaffold in minutes."],
            ["Motion-ready", "Subtle animations and transitions are built in with Framer Motion."],
            ["Production base", "Typed, modular components with a clean app-router structure."],
          ].map(([title, desc]) => (
            <Card key={title} className="backdrop-blur-sm">
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </motion.div>

        <motion.div variants={item}>
          <Card className="backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Quick Prompt Lab</CardTitle>
              <CardDescription>
                Try a prompt like: “Premium fintech landing page with dark mode and subtle neon accents.”
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="App name or concept" />
              <Textarea placeholder="Describe the style, layout, and interaction feel you want..." className="min-h-28" />
              <Button className="w-full md:w-auto">Generate Next Iteration</Button>
            </CardContent>
          </Card>
        </motion.div>
      </motion.section>
    </main>
  );
}
