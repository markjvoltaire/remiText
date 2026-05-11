/** Strip common markdown so iMessage bubbles stay readable (Photon iMessage skill pattern). */
export function stripMarkdown(text) {
    return text
        .replace(/#{1,6}\s+/g, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/`{3}[\s\S]*?`{3}/g, (match) => match.replace(/`{3}\w*\n?/g, '').trim())
        .replace(/`(.+?)`/g, '$1')
        .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
        .replace(/^[-*+]\s+/gm, '• ')
        .replace(/^\d+\.\s+/gm, (match) => match)
        .replace(/^>\s+/gm, '')
        .trim();
}
