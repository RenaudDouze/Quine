import { useHashRoute } from "./hooks/useHashRoute";
import HomeView from "./views/HomeView";
import EditorView from "./views/EditorView";
import PlayView from "./views/PlayView";

export default function App() {
  const route = useHashRoute();

  switch (route.name) {
    case "editor":
      return <EditorView key={route.id} id={route.id} />;
    case "play":
      return route.id ? <PlayView key={route.id} id={route.id} /> : <HomeView />;
    default:
      return <HomeView />;
  }
}
