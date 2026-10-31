import { StoryView } from "@/components/StoryView";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoryView id={id} />;
}
