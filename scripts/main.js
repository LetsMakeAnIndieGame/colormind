require([
	'colormind',
	'jquery'
],
function (ColorMind) {
	var colorMind = ColorMind.getInstance();

	var colorMindOptions = {
		target: $(document.body),
		"left": false,
		simulated: true
	}
	colorMind.initialize(colorMindOptions);
});