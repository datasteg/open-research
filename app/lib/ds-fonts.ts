// The datasteg type (the datasteg family kit): the fonts www sets, self-hosted from npm (all SIL OFL 1.1), then the type layer
// that points each design system's font tokens at them. Every face ships as unicode-range slices, so an English page
// fetches no Hangul. Import once in the root layout, after the app's own stylesheets. A copy of the datasteg family kit.
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/libre-franklin';
import '@fontsource-variable/noto-serif-kr';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './ds-type.css';
