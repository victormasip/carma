// Makes a rendered preview inert.
//
// Every link and form in a public preview is cancelled in the capture phase: no
// navigating into /render/preview/* (which would 404), and no leaving for the
// client's real site from inside our frame. Shared by the clone preview and the
// Door's design preview (W5).

export const PREVIEW_CLICK_BLOCKER =
  `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(a){e.preventDefault();e.stopPropagation();}},true);document.addEventListener('submit',function(e){e.preventDefault();},true);</script>`

export function guardPreview(html: string): string {
  return html.includes('</body>')
    ? html.replace('</body>', `${PREVIEW_CLICK_BLOCKER}</body>`)
    : html + PREVIEW_CLICK_BLOCKER
}
