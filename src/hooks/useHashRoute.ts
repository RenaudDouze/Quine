import { useEffect, useState } from "react";

export interface Route {
  name: string;
  id?: string;
}

function parseHash(): Route {
  const h = window.location.hash.slice(1);
  if (!h) return { name: "home" };
  const [name, id] = h.split("/");
  return { name: name || "home", id };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

export function navigate(name: string, id?: string): void {
  window.location.hash = id ? `${name}/${id}` : name;
}
