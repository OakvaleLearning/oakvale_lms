/**
 * The iframe for an EMBED part: a page hosted elsewhere, such as a Genially.
 * The sandbox lets it run (scripts, its own cookies, links opening in a new
 * tab) but stops it from navigating the LMS page itself away.
 */
export function EmbedFrame({ src, title, className }: { src: string; title: string; className?: string }) {
  return (
    <iframe
      src={src}
      title={title}
      className={className}
      allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads"
    />
  );
}
