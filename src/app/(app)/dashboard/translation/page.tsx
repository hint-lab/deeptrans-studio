import { redirect } from 'next/navigation';

/**
 * Keep legacy bookmarks working without exposing the obsolete translation
 * surface, whose controls did not all have real backing behavior.
 */
export default function TranslationPage() {
    redirect('/dashboard/instant-translate');
}
