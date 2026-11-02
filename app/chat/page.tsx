import type { Metadata } from 'next';
import ChatClient from './ChatClient';

export const metadata: Metadata = { title: 'Chat · SHADE', description: 'Private AI chat, paid in SOL.' };

export default function ChatPage() {
  return <ChatClient />;
}
