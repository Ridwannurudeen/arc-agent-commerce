"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, X } from "lucide-react";

export function TerminalToggle() {
  const [active, setActive] = useState(false);

  const toggle = useCallback(() => {
    setActive((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("terminal-view", next);
      localStorage.setItem("terminal-view", next ? "1" : "0");
      return next;
    });
  }, []);

  useEffect(() => {
    if (localStorage.getItem("terminal-view") === "1") {
      setActive(true);
      document.documentElement.classList.add("terminal-view");
    }
  }, []);

  return (
    <motion.button
      onClick={toggle}
      className="terminal-toggle-btn"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={active ? "Exit terminal mode" : "Terminal mode"}
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "1.5rem",
        zIndex: 300,
        width: 44,
        height: 44,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: active ? "1px solid #22c55e" : "1px solid rgba(59,130,246,0.3)",
        background: active
          ? "rgba(34,197,94,0.12)"
          : "rgba(10,10,15,0.8)",
        backdropFilter: "blur(12px)",
        color: active ? "#22c55e" : "#8888a0",
        cursor: "pointer",
        transition: "border-color 0.2s, background 0.2s, color 0.2s",
        boxShadow: active
          ? "0 0 20px rgba(34,197,94,0.15)"
          : "0 0 20px rgba(59,130,246,0.08)",
      }}
    >
      <AnimatePresence mode="wait">
        {active ? (
          <motion.div
            key="x"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <X size={18} />
          </motion.div>
        ) : (
          <motion.div
            key="term"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Terminal size={18} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
