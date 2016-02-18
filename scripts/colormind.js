/*

    This module incorporates code (Daltonize and Simulate methods) which were developed by a 3rd party
    See here: http://galacticmilk.com/labs/index.php?dir=Color-Vision%2FChrome%2F

    This is a plug-and-play module which will process a "target" element on a web page, changing all of the colors
    of the elements within that target to aid people with color-blind defincies with viewing the web page
    without requiring any planning or changes from the web developer.

    It will append a button to the end of the target element which triggers a modal dialogue, allowing the user
    to process the colors of the webpage to one of three solutions for protanopia, deuteronopia, and tritanopia.
    At this time no options are planned for either atypical achromotopsia (no color) and typical achromotopsia (subdued colors).

    This module scans the colors of elements and images within the target HTML element, then changes them one at a time,
    in order to rearrange the colors into a range which will provide better contrast to the color-blind user.  Because of this
    the complexity of the algorithm is linear tending towards O(n*m) where n is the number of elements/images in the
    target and m is the average number of items/pixels within the elements/images of the target.  It may be VERY slow,
    however optimizations can help with speed.  For instance, pixels which have equal RGB values will be ignored,
    as they are considered "colorless", being some various shade of gray (including black and white).

    This module is designed to work with require.js or simply be included via a <script> tag in a html, php, etc. file.

    ColorMind class is a "static" singleton (to avoid collisions within a project).  It has one public facing function which
    is used to process the webpage and change the colors within it.  This requires an options object and a target
    element.  jQuery is a dependency of this module, and so ColorMind will expect a jQuery object wrapping
    an HTML element as the target argument.  The options define the behavior of ColorMind's processing algorithm.
    Both arguments are optional.  Note that target will default to the document's body.  Default options are:

    The static ColorMind object wraps the internal singleton which has 2 public facing functions and actually
    performs the color swapping.  The x public facing functions are (...)
*/

// May need to replace dom events with solution listed in this link: http://stackoverflow.com/questions/6997826/alternative-to-domnodeinserted
// but only IF the dom events go away in future implementations of browsers

(function () {
    'use strict';

    var ColorMind = (function() {
        var _ColorMind = function() {
            /*
                Data members
            */
            var _options = {
                simulated       : false,
                target          : $(document.body),
                type            : "None",
                amount          : 1,
                bottom          : true,
                left            : true
            };

            // This stores the backup document.body, that's untouched so we can swap it in when user changes options
            var backupBody;
            // This tracks which type of filter the user last applied to the target
            var currentType = _options.type;

            // NONE OF THIS MUTATION OBSERVER STUFF WORKS YET....PROBLEM IS THE STANDARDS CHANGED FROM
            // A SYNCHRONOUS MUTATION OBSERVER TO AN ASYNCHRONOUS OBSERVER
            // NEED TO FIND A UNIVERSAL SOLUTION FOR OLD AND NEW BROWSERS
            // IN THE MEANTIME THIS PLUGIN WILL NOT WORK WITH HIGHLY DYNAMIC WEBPAGES
            var mutationObserver;
            if ("MutationObserver" in window) {
                mutationObserver = new MutationObserver(function (mutations) {
                    mutations.forEach(function (mutation) {
                        if (backupBody && mutation.type === "attributes") {
                            var actualSelectorStr = "";
                            var memorySelectorStr = "";
                            var backupElem;
                            var node = mutation.target;
                            if (node.tagName === "BODY") { return; }
                            actualSelectorStr += node.tagName;
                            memorySelectorStr += node.tagName;
                            if (mutation.attributeName === "id") {
                                memorySelectorStr += mutation.oldValue ? "#"+mutation.oldValue : "";
                            } else {
                                memorySelectorStr += node.id !== "" ? "#" + node.id : "";
                            }
                            actualSelectorStr += node.id !== "" ? "#" + node.id : "";

                            if (mutation.attributeName === "class") {
                                memorySelectorStr += mutation.oldValue ? "." + mutation.oldValue.split(" ").join(".") : "";
                            } else {
                                memorySelectorStr += node.classList.length > 0 ? "." + node.classList.toString().split(" ").join(".") : "";
                            }
                            actualSelectorStr += node.classList.length > 0 ? "." + node.classList.toString().split(" ").join(".") : "";
                            var testElem = $(document.body).find(actualSelectorStr);
                            var found = false;
                            $.each(testElem, function (index, elem) {
                                if ($(elem).is($(node))) {
                                    backupElem = $(backupBody.find(memorySelectorStr)[index]);
                                    found = true;
                                    return false;
                                }
                            });
                            if (found) {
                                backupElem.attr(mutation.attributeName, node.getAttribute(mutation.attributeName));
                            } else {
                                console.debug("COULDN'T FIND THE MATCHING ELEMENT");
                            }
                        }
                    });
                });
            }

            var CVDMatrix = { // Color Vision Deficiency
                "Protanope": [ // reds are greatly reduced (1% men)
                    0.0, 2.02344, -2.52581,
                    0.0, 1.0,      0.0,
                    0.0, 0.0,      1.0
                ],
                "Deuteranope": [ // greens are greatly reduced (1% men)
                    1.0,      0.0, 0.0,
                    0.494207, 0.0, 1.24827,
                    0.0,      0.0, 1.0
                ],
                "Tritanope": [ // blues are greatly reduced (0.003% population)
                    1.0,       0.0,      0.0,
                    0.0,       1.0,      0.0,
                    -0.395913, 0.801109, 0.0
                ]
            };

            var ConfusionLines = {
                "Protanope": {
                    x: 0.7465,
                    y: 0.2535,
                    m: 1.273463,
                    yint: -0.073894
                },
                "Deuteranope": {
                    x: 1.4,
                    y: -0.4,
                    m: 0.968437,
                    yint: 0.003331
                },
                "Tritanope": {
                    x: 0.1748,
                    y: 0.0,
                    m: 0.062921,
                    yint: 0.292119
                }
            };

            /*
                "Private" methods
            */

            function handleNodeInserted (event) {
                if (backupBody) {
                    // console.log("event: ", event);
                    var node = $(event.srcElement).parent()[0];
                    // console.log("source element: ", event.srcElement);
                    var selectorStr = "";
                    selectorStr += node.tagName;
                    selectorStr += node.id !== "" ? "#" + node.id : "";
                    selectorStr += node.classList.length > 0 ? "." + node.classList.toString().split(" ").join(".") : "";
                    var backupTarget;

                    var testElem = $(document.body).find(selectorStr);
                    var found = false;
                    $.each(testElem, function (index, elem) {
                        if ($(elem).is($(node))) {
                            backupTarget = $(backupBody.find(selectorStr)[index]);
                            found = true;
                            return false;
                        }
                    });

                    if (found) {
                        var index = $(event.srcElement).index() - 1;
                        // console.log("Backup target: ", backupTarget);
                        backupTarget.children().eq(index).after($(event.srcElement).clone(true, true));
                    } else {
                        // console.debug("COULD NOT FIND ELEMENT!");
                    }
                    // console.log($(event.srcElement).parent().children(), $(event.srcElement).index());
                }
            }

            function handleNodeRemoved (event) {
                if (backupBody) {
                    // console.log("event: ", event);
                    // console.log("Index? ", $(event.srcElement).index());

                    var node = $(event.srcElement).parent()[0];
                    var selectorStr = "";
                    selectorStr += node.tagName;
                    selectorStr += node.id !== "" ? "#" + node.id : "";
                    selectorStr += node.classList.length > 0 ? "." + node.classList.toString().split(" ").join(".") : "";
                    var backupTarget;

                    var testElem = $(document.body).find(selectorStr);
                    var found = false;
                    $.each(testElem, function (index, elem) {
                        if ($(elem).is($(node))) {
                            backupTarget = $(backupBody.find(selectorStr)[index]);
                            found = true;
                            return false;
                        }
                    });

                    if (found) {
                        var index = $(event.srcElement).index();
                        // console.log("Backup target: ", backupTarget);
                        backupTarget.children().eq(index).remove();
                    } else {
                        // console.debug("COULD NOT FIND ELEMENT!");
                    }
                }
            }

            function handleCharacterDataModified (event) {
                // console.log("Character data modified");
            }

            function handleAttrModified (event) {
                // console.log("Previous value: ", event.originalEvent.prevValue);
                // console.log("Attribute Modified: ", event);

                var actualSelectorStr = "";
                var memorySelectorStr = "";
                var backupElem;
                var node = event.srcElement;

                if (node.tagName === "BODY") { return; }

                actualSelectorStr += node.tagName;
                memorySelectorStr += node.tagName;

                if (mutation.attributeName === "id") {
                    actualSelectorStr += mutation.oldValue ? "#"+mutation.oldValue : "";
                } else {
                    actualSelectorStr += node.id !== "" ? "#" + node.id : "";
                }

                memorySelectorStr += node.id !== "" ? "#" + node.id : "";

                if (mutation.attributeName === "class") {
                    actualSelectorStr += event.originalEvent.prevValue ? "." + event.originalEvent.prevValue.split(" ").join(".") : "";
                } else {
                    actualSelectorStr += node.classList.length > 0 ? "." + node.classList.toString().split(" ").join(".") : "";
                }
                memorySelectorStr += node.classList.length > 0 ? "." + node.classList.toString().split(" ").join(".") : "";

                var testElem = $(document.body).find(actualSelectorStr);
                var found = false;
                $.each(testElem, function (index, elem) {
                    if ($(elem).is($(node))) {
                        backupElem = $(backupBody.find(memorySelectorStr)[index]);
                        found = true;
                        return false;
                    }
                });
                if (found) {
                    backupElem.attr(mutation.attributeName, node.getAttribute(mutation.attributeName));
                } else {
                    console.debug("COULDN'T FIND THE MATCHING ELEMENT");
                }
            }

            var DaltonizeRGB = function (red, green, blue, alpha, options) {
                if(!options) options = { };
                var type = typeof options.type == "string" ? options.type : "Normal",
                    amount = typeof options.amount == "number" ? options.amount : 1.0;

                var cvd = CVDMatrix[type],
                    cvd_a = cvd[0],
                    cvd_b = cvd[1],
                    cvd_c = cvd[2],
                    cvd_d = cvd[3],
                    cvd_e = cvd[4],
                    cvd_f = cvd[5],
                    cvd_g = cvd[6],
                    cvd_h = cvd[7],
                    cvd_i = cvd[8];

                var L, M, S, l, m, s, R, G, B, RR, GG, BB;
                var r = red;
                var g = green;
                var b = blue;

                var max = Math.max(r,g,b);
                var min = Math.min(r,g,b);

                if (r == g && g == b){
                    red = r;
                    green = g;
                    blue = b;
                } else {
                    // RGB to LMS matrix conversion
                    L = (17.8824 * r) + (43.5161 * g) + (4.11935 * b);
                    M = (3.45565 * r) + (27.1554 * g) + (3.86714 * b);
                    S = (0.0299566 * r) + (0.184309 * g) + (1.46709 * b);
                    // Simulate color blindness
                    l = (cvd_a * L) + (cvd_b * M) + (cvd_c * S);
                    m = (cvd_d * L) + (cvd_e * M) + (cvd_f * S);
                    s = (cvd_g * L) + (cvd_h * M) + (cvd_i * S);
                    // LMS to RGB matrix conversion
                    R = (0.0809444479 * l) + (-0.130504409 * m) + (0.116721066 * s);
                    G = (-0.0102485335 * l) + (0.0540193266 * m) + (-0.113614708 * s);
                    B = (-0.000365296938 * l) + (-0.00412161469 * m) + (0.693511405 * s);
                    // Isolate invisible colors to color vision deficiency (calculate error matrix)
                    R = r - R;
                    G = g - G;
                    B = b - B;
                    // Shift colors towards visible spectrum (apply error modifications)
                    RR = (0.0 * R) + (0.0 * G) + (0.0 * B);
                    GG = (0.7 * R) + (1.0 * G) + (0.0 * B);
                    BB = (0.7 * R) + (0.0 * G) + (1.0 * B);
                    // Add compensation to original values
                    R = RR + r;
                    G = GG + g;
                    B = BB + b;
                    // Clamp values
                    if(R < 0) R = 0;
                    if(R > 255) R = 255;
                    if(G < 0) G = 0;
                    if(G > 255) G = 255;
                    if(B < 0) B = 0;
                    if(B > 255) B = 255;
                    // Record color
                    red = R >> 0;
                    green = G >> 0;
                    blue = B >> 0;
                }

                return [red, green, blue, alpha];
            }

            var DaltonizeImage = function (image, options) {
                console.log("daltonize image");
                var canvas = document.createElement("canvas");
                var ctx = canvas.getContext("2d");

                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                // var url = 'http://lorempixel.com/g/400/200/';
                // var imgObj = new Image(); // This is only needed if you have cross-domain tainting
                // imgObj.src = image.src + '?' + new Date().getTime();
                // imgObj.setAttribute('crossOrigin', ''); 
                ctx.drawImage(image, 0, 0);
                try {
                    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    var data = imageData.data;
                } catch(e) { console.log(e); return; }

                for(var id = 0, length = data.length; id < length; id += 4) {
                    var imgColor = [];
                    var r = data[id];
                    var g = data[id + 1];
                    var b = data[id + 2];
                    var a = data[id + 3];

                    if (r == g && g == b) {
                        imgColor = [r, g, b, a];

                        // Record color
                        data[id] = r;
                        data[id + 1] = g;
                        data[id + 2] = b;
                        data[id + 3] = a;
                    } else {
                        imgColor = DaltonizeRGB(r, g, b, a, options);

                        // Record color
                        data[id] = imgColor[0];
                        data[id + 1] = imgColor[1];
                        data[id + 2] = imgColor[2];
                        data[id + 3] = imgColor[3];
                    }
                }
                // Record data
                ctx.putImageData(imageData, 0, 0);
                if(typeof options.callback == "function") {
                    options.callback(image, canvas);
                }
            }

            var SimulateRGB = function(red, green, blue, alpha, options) {
                if(!options) options = { };
                var type = typeof options.type == "string" ? options.type : "Normal",
                    amount = typeof options.amount == "number" ? options.amount : 1.0;
                // Apply simulation
                switch(type) {
                    case "Normal":
                        return [red, green, blue, alpha];
                    case "Achromatope":
                        var sr = red, // source-pixel
                            sg = green,
                            sb = blue,
                            // convert to Monochrome using sRGB WhitePoint
                            dr = (sr * 0.212656 + sg * 0.715158 + sb * 0.072186), // destination-pixel
                            dg = dr,
                            db = dr;
                        // Anomylize colors
                        dr = sr * (1.0 - amount) + dr * amount;
                        dg = sg * (1.0 - amount) + dg * amount;
                        db = sb * (1.0 - amount) + db * amount;
                        // Record values
                        red = dr >> 0;
                        green = dg >> 0;
                        blue = db >> 0;
                        return [red, green, blue, alpha];
                    case "Custom":
                        var confuse_x = options.x,
                            confuse_y = options.y,
                            confuse_m = options.m,
                            confuse_yint = options.yint;
                        break;
                    default:
                        var line = ConfusionLines[type],
                            confuse_x = line.x,
                            confuse_y = line.y,
                            confuse_m = line.m,
                            confuse_yint = line.yint;
                        break;
                }
                // Simulate: Protanope, Deuteranope, or Tritanope
                var sr = red, // source-pixel
                    sg = green,
                    sb = blue,
                    dr = sr, // destination-pixel
                    dg = sg,
                    db = sb;
                // Convert source color into XYZ color space
                var pow_r = Math.pow(sr, 2.2),
                    pow_g = Math.pow(sg, 2.2),
                    pow_b = Math.pow(sb, 2.2);
                var X = pow_r * 0.412424 + pow_g * 0.357579 + pow_b * 0.180464, // RGB->XYZ (sRGB:D65)
                    Y = pow_r * 0.212656 + pow_g * 0.715158 + pow_b * 0.0721856,
                    Z = pow_r * 0.0193324 + pow_g * 0.119193 + pow_b * 0.950444;
                // Convert XYZ into xyY Chromacity Coordinates (xy) and Luminance (Y)
                var chroma_x = X / (X + Y + Z);
                var chroma_y = Y / (X + Y + Z);
                // Generate the “Confusion Line" between the source color and the Confusion Point
                var m = (chroma_y - confuse_y) / (chroma_x - confuse_x); // slope of Confusion Line
                var yint = chroma_y - chroma_x * m; // y-intercept of confusion line (x-intercept = 0.0)
                // How far the xy coords deviate from the simulation
                var deviate_x = (confuse_yint - yint) / (m - confuse_m);
                var deviate_y = (m * deviate_x) + yint;
                // Compute the simulated color’s XYZ coords
                var X = deviate_x * Y / deviate_y;
                var Z = (1.0 - (deviate_x + deviate_y)) * Y / deviate_y;
                // Neutral grey calculated from luminance (in D65)
                var neutral_X = 0.312713 * Y / 0.329016;
                var neutral_Z = 0.358271 * Y / 0.329016;
                // Difference between simulated color and neutral grey
                var diff_X = neutral_X - X;
                var diff_Z = neutral_Z - Z;
                var diff_r = diff_X * 3.24071 + diff_Z * -0.498571; // XYZ->RGB (sRGB:D65)
                var diff_g = diff_X * -0.969258 + diff_Z * 0.0415557;
                var diff_b = diff_X * 0.0556352 + diff_Z * 1.05707;
                // Convert to RGB color space
                dr = X * 3.24071 + Y * -1.53726 + Z * -0.498571; // XYZ->RGB (sRGB:D65)
                dg = X * -0.969258 + Y * 1.87599 + Z * 0.0415557;
                db = X * 0.0556352 + Y * -0.203996 + Z * 1.05707;
                // Compensate simulated color towards a neutral fit in RGB space
                var fit_r = ((dr < 0.0 ? 0.0 : 1.0) - dr) / diff_r;
                var fit_g = ((dg < 0.0 ? 0.0 : 1.0) - dg) / diff_g;
                var fit_b = ((db < 0.0 ? 0.0 : 1.0) - db) / diff_b;
                var adjust = Math.max( // highest value
                    (fit_r > 1.0 || fit_r < 0.0) ? 0.0 : fit_r,
                    (fit_g > 1.0 || fit_g < 0.0) ? 0.0 : fit_g,
                    (fit_b > 1.0 || fit_b < 0.0) ? 0.0 : fit_b
                );
                // Shift proportional to the greatest shift
                dr = dr + (adjust * diff_r);
                dg = dg + (adjust * diff_g);
                db = db + (adjust * diff_b);
                // Apply gamma correction
                dr = Math.pow(dr, 1.0 / 2.2);
                dg = Math.pow(dg, 1.0 / 2.2);
                db = Math.pow(db, 1.0 / 2.2);
                // Anomylize colors
                dr = sr * (1.0 - amount) + dr * amount;
                dg = sg * (1.0 - amount) + dg * amount;
                db = sb * (1.0 - amount) + db * amount;
                // Return values
                red = dr >> 0;
                green = dg >> 0;
                blue = db >> 0;

                return [red, green, blue, alpha];
            }

            var SimulateImage = function (image, options) {
                console.log("simulated image");
                var type = typeof options.type == "string" ? options.type : "Normal",
                    amount = typeof options.amount == "number" ? options.amount : 1.0;
                var canvas = document.createElement("canvas");
                var ctx = canvas.getContext("2d");
                canvas.width = image.width;
                canvas.height = image.height;
                ctx.drawImage(image, 0, 0);
                try {
                    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    var data = imageData.data;
                } catch(e) { return; }
                // Apply simulation
                switch(type) {
                    case "Normal":
                        document.body.appendChild(canvas);
                        return;
                    case "Achromatope":
                        for(var id = 0, length = data.length; id < length; id += 4) {
                            var imgColor = [];

                            var sr = data[id]; // source-pixel
                            var sg = data[id + 1];
                            var sb = data[id + 2];
                            var sa = data[id + 3];

                            imgColor = SimulateRGB(sr, sg, sb, sa, options);

                            // Record values
                            data[id] = imgColor[0] >> 0;
                            data[id + 1] = imgColor[1] >> 0;
                            data[id + 2] = imgColor[2] >> 0;
                            data[id + 3] = imgColor[3] >> 0;
                        }
                        // Record data
                        ctx.putImageData(imageData, 0, 0);
                        if(typeof options.callback == "function") {
                            options.callback(image, canvas);
                        }
                        return;
                    case "Custom":
                        var confuse_x = options.x,
                            confuse_y = options.y,
                            confuse_m = options.m,
                            confuse_yint = options.yint;
                        break;
                    default:
                        var line = ConfusionLines[type],
                            confuse_x = line.x,
                            confuse_y = line.y,
                            confuse_m = line.m,
                            confuse_yint = line.yint;
                        break;
                }
                // Simulate: Protanope, Deuteranope, or Tritanope
                for(var id = 0, length = data.length; id < length; id += 4) {
                    var imgColor = [];

                    var sr = data[id]; // source-pixel
                    var sg = data[id + 1];
                    var sb = data[id + 2];
                    var sa = data[id + 3];

                    imgColor = SimulateRGB(sr, sg, sb, sa, options);

                    // Return values
                    data[id] = imgColor[0];
                    data[id + 1] = imgColor[1];
                    data[id + 2] = imgColor[2];
                    data[id + 3] = imgColor[3];
                }
                // Record data
                ctx.putImageData(imageData, 0, 0);
                if(typeof options.callback == "function") {
                    options.callback(image, canvas);
                }
            }

            // callback for image processing, replaces the old image with the daltonized
            // or simulated image
            var swapImage = function (image, canvas) {
                console.log("Swap image");
                var newImage = document.createElement("img");
                // We have to grab src here because this is the only attribute we get from
                // the canvas, not the old image
                $(newImage).attr("src", canvas.toDataURL());

                $(image).before(newImage);
                // We need the old image's html attriutes on the new image
                var attributes = image.attributes;

                // take all of the html attributes from the old image and graft them to the new one (except src of course)
                $.each(attributes, function (__, attribute) {
                    if (attribute.name !== "src") {
                        $(newImage).attr(attribute.name, attribute.value);
                    }
                });

                $(image).remove();
            }

            /*
                "Public" methods
            */
            this.initialize = function(options) {
                var that = this;

                // initialize the general options for behavior (not specifics like type, yet)
                _options.simulated          = options.simulated         || _options.simulated;
                _options.target             = options.target            || _options.target;
                _options.amount             = options.amount            || _options.amount;
                if (options.bottom !== undefined)
                    _options.bottom         = options.bottom;
                if (options.left !== undefined)
                    _options.left           = options.left;
                _options.overlayClass       = options.overlayClass      || "";

                // append the button that creates this stuff, remove the old one in case the options need reset
                $("#colormind-button").remove();
                $(document.body).append("<input id='colormind-button' type='button' value='Color Blind Filter'></input>");

                // Set the position of the colormind button based on the options
                $("#colormind-button").css("bottom", _options.bottom ? "0px" : "auto");
                $("#colormind-button").css("top", _options.bottom ? "auto" : "0px");
                $("#colormind-button").css("left", _options.left ? "0px" : "auto");
                $("#colormind-button").css("right", _options.left ? "auto" : "0px");

                // append the modal dialogue elements
                $(document.head).append($("<div id='colormind-options' title='ColorMind Options' style='display:none'>" +
                                         "Type: <select id='colormind-type'>" +
                                                "<option value='None'>None</option>" +
                                                "<option value='Protanope'>Protanopia</option>" +
                                                "<option value='Deuteranope'>Deuteranopia</option>" +
                                                "<option value='Tritanope'>Tritanopia</option>" +
                                            "</select>" +
                                            "<br><br>" +
                                            "<input id='colormind-trigger' type='button' value='Apply to Page'></input>" +
                                         "</div>"));

                // Set colormind events to activate the widget, change the options, and apply changes to page
                $("#colormind-button").addClass(_options.overlayClass);
                $(document).on('click', '#colormind-button', function (event) {
                    $("#colormind-options").dialog({
                        modal: true
                    });
                });

                $(document).on('click', '#colormind-trigger', function (event) {
                    $("#colormind-options").dialog("close");

                    if (currentType !== _options.type) {
                        // Going from None to something
                        if (currentType === "None" && _options.type !== "None") {
                            var clone = $(document.body).clone(true, true);
                            clone.find(".ui-dialog,.ui-widget-overlay").remove();
                            backupBody = clone;

                            var processOptions = {};

                            processOptions.type = _options.type;
                            processOptions.amount = _options.amount;

                            that.processTarget(_options.target, processOptions);
                        // Going from something to something else but not none
                        } else if (currentType !== "None" && _options.type !== "None") {
                            var currentBody = $(document.body);
                            currentBody.html(backupBody.html());

                            var processOptions = {};

                            processOptions.type = _options.type;
                            processOptions.amount = _options.amount;

                            that.processTarget(_options.target, processOptions);
                        // Going from something else back to None
                        } else if (currentType !== "None" && _options.type === "None") {
                            var currentBody = $(document.body);

                            currentBody.html(backupBody.html());
                        }
                    }

                    currentType = _options.type;
                });

                $(document).on('change', '#colormind-type', function (event) {
                    _options.type = $("#colormind-type").val();
                });

                $(document).on('DOMNodeRemoved', document, handleNodeRemoved);

                $(document).on('DOMNodeInserted', document, handleNodeInserted);

                if (!"MutationObserver" in window) {
                    $(document).on('DOMAttrModified', "#test", handleAttrModified);
                } else {
                    var config = {
                        childList: false,
                        attributes: true,
                        attributeOldValue: true,
                        characterData: false,
                        subtree: true
                    };
                    mutationObserver.observe(document, config);
                }

                $(document).on('DOMCharacterDataModified', document, handleCharacterDataModified);
            }


            // This should really be "private"
            this.processTarget = function(target, options) {
                console.log("Process target");

                options = options || {};
                options.callback = swapImage;

                // turn off the MutationObserver so that it doesn't track what's happening during the filtering
                // process, because we don't care about these changes and it'll cost a lot of performance
                if (mutationObserver) mutationObserver.disconnect();

                $(document).off('DOMAttrModified', document);
                $(document).off('DOMNodeRemoved', document);
                $(document).off('DOMNodeInserted', document);
                $(document).off('DOMCharacterDataModified', document);

                // "refresh" the jQuery target to ensure we have a valid reference
                target = $(target.selector);
                target = $(document.body); // temporary while sorting out why the reference is lost by this point....

                // This will not apply to the target itself...undesirable?
                $.each(target.find("*"), function (__, child) {
                    child = $(child);

                    // Check if element is image, otherwise handle it as individual rgba color or background-color
                    if (child.is("img") && child.width() > 0 && child.height() > 0) {
                        // This will convert the image to a canvas, redraw it, place the data into a new image,
                        // then replace the old image with a new image (see swapImage)
                        if (_options.simulated) {
                            console.log("Simulated");
                            SimulateImage(child[0], options);
                        } else {
                            DaltonizeImage(child[0], options);
                        }
                    } else {
                        // get the child's color, pull out the rgba values and convert to ints
                        var colorTemp = child.css("color") === "transparent" ? "rgba(0,0,0,0)" : child.css("color");
                        var colors = colorTemp
                                          .match(/\d+/gi)
                                          .map(function (item) {
                            return parseInt(item);
                        });
                        // ditto for background-color
                        // console.log(child.css("background-color"));
                        var backgroundColorTemp = child.css("background-color") === "transparent" ? "rgba(0,0,0,0)" : child.css("background-color");
                        var backgroundColors = backgroundColorTemp
                                                    .match(/\d+/gi)
                                                    .map(function (item) {
                            return parseInt(item);
                        });

                        // convert the colors (returns as array)
                        if (_options.simulated) {
                            colors = SimulateRGB(colors[0], colors[1], colors[2], colors[3], options);
                            backgroundColors = SimulateRGB(backgroundColors[0], backgroundColors[1], backgroundColors[2], backgroundColors[3], options);
                        } else {
                            colors = DaltonizeRGB(colors[0], colors[1], colors[2], colors[3], options);
                            backgroundColors = DaltonizeRGB(backgroundColors[0], backgroundColors[1], backgroundColors[2], backgroundColors[3], options);
                        }


                        // reset the colors to the element
                        child.css("color", "rgba(" + colors.join(",") + ")");
                        child.css("background-color", "rgba(" + backgroundColors.join(",") + ")");
                    }
                });

                if (mutationObserver) {
                    var config = {
                        childList: false,
                        attributes: true,
                        attributeOldValue: true,
                        characterData: false,
                        subtree: true
                    };
                    mutationObserver.observe(document, config);
                } else {
                    $(document).on('DOMAttrModified', "#test", handleAttrModified);
                }

                $(document).on('DOMNodeRemoved', document, handleNodeRemoved);

                $(document).on('DOMNodeInserted', document, handleNodeInserted);

                $(document).on('DOMCharacterDataModified', document, handleCharacterDataModified);
            }
        }

        /*
            Singleton interface
        */
        var instance;

        return {
            getInstance: function () {
                if (!instance) {
                    instance = new _ColorMind();
                }

                return instance;
            }
        };
    })();

    // export as AMD/CommonJS module or global variable
    if (typeof define === 'function' && define.amd) define('colorMind', [], function() { return ColorMind; });
    else if (typeof module !== 'undefined') module.exports = ColorMind;
    else if (typeof self !== 'undefined') self.ColorMind = ColorMind;
    else window.ColorMind = ColorMind;
})();