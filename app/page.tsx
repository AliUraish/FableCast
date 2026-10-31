import Link from "next/link";
import { HomeForm } from "@/components/HomeForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="home">
      <header className="home-top">
        <Link href="/" className="wordmark">FABLECAST</Link>
        <ThemeToggle />
      </header>
      <HomeForm />
      <footer className="home-foot row mono dim" style={{ justifyContent: "flex-end" }}>
        <Link href="/health">HEALTH</Link>
      </footer>
    </div>
  );
}
