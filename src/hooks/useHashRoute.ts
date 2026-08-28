import { useEffect, useState } from "react";

export interface Route {
  name: string;
}

function parseHash(): Route {
  const name = window.location.hash.slice(1);
  return { name: name || "home" };
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

export function navigate(name: string): void {
  window.location.hash = name;
}
