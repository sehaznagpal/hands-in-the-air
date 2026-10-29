// ?marbles=1 and ?guide=1 show debug sheets (no scene, no camera); anything else starts the app.
const query = new URLSearchParams(location.search);
if (query.get('marbles') === '1') {
  void import('./marblesheet').then((m) => m.showSheet());
} else if (query.get('guide') === '1') {
  void import('./guidepage').then((m) => m.showGuide());
} else {
  void import('./app');
}
