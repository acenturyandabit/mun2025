function getNextR(seed) {
    seed = seed * 16807 % 2147483647
    return seed;
}


function makeFlag(seed, canvas) { // seed is a number from 0 to 50k
    if (typeof (seed) == "string") {
        seed = Array.from(seed).reduce((p, i) => p + i.charCodeAt(0), 0);
    }
    // returns a canvas
    let c;
    if (canvas) c = canvas;
    else c = document.createElement("canvas");
    let width = c.width = 500;
    let height = c.height = 300;
    let ctx = c.getContext('2d');
    let motifs = Array(100).fill(0).map((i, ii) => JSON.parse(`"\\u${(9877 + ii).toString(16)}"`));
    //flag style
    let cols = Array(6).fill(0).map(i => { seed = getNextR(seed); return 'hsl(' + getNextR(seed) % 360 + ',100%,50%)'; });
    switch (seed % 6) {
        case 0:
        default:
            //horizontal stripes
            seed = Math.floor(seed / 6);
            //pattern?
            let h_breakpoints = [
                [0, 0.5, 1],
                [0, 0.333, 0.6666, 1],
                [0, 0.25, 0.75, 1],
                [0, 0.25, 0.5, 0.75, 1]
            ];
            let h_sel_bp = h_breakpoints[seed % h_breakpoints.length];
            for (let i = 1; i < h_sel_bp.length; i++) {
                ctx.fillStyle = cols[i];
                ctx.fillRect(0, h_sel_bp[i - 1] * height, width, h_sel_bp[i] * height);
            }
            seed = Math.floor(seed / h_breakpoints.length);
            break;
        case 1:
            //horizontal stripes
            seed = Math.floor(seed / 6);
            //pattern?
            let v_breakpoints = [
                [0, 0.5, 1],
                [0, 0.333, 0.6666, 1],
                [0, 0.25, 0.75, 1],
                [0, 0.25, 0.5, 0.75, 1]
            ];
            let v_sel_bp = v_breakpoints[seed % v_breakpoints.length];
            for (let i = 1; i < v_sel_bp.length; i++) {
                ctx.fillStyle = cols[i];
                ctx.fillRect(v_sel_bp[i - 1] * width, 0, v_sel_bp[i] * width, height);
            }
            seed = Math.floor(seed / v_breakpoints.length);
            break;

        case 2:
            //cross
            // pattern? (quadrants, centre cross)
            crossStartX = seed = getNextR(seed);
            crossStartX %= 50;
            crossStartX /= 100;
            crossStartY = seed = getNextR(seed);
            crossStartY %= 50;
            crossStartY /= 100;
            crossW = seed = getNextR(seed);
            crossW %= 5;
            crossW /= 20;
            crossW += 0.1;
            crossW *= width;
            ctx.fillStyle = cols[0];
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = cols[1];
            ctx.fillRect(crossStartX * width, 0, crossW, height);
            ctx.fillRect(0, crossStartY * height, width, crossW);
            break;
        case 3:
            // slanted stripe cross
            ctx.save();
            crossAngle = seed = getNextR(seed);
            ctx.fillStyle = cols[0];
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = cols[1];
            ctx.rotate(crossAngle * Math.PI / 180);
            ctx.fillRect(-width, height * 3 / 8, width*2, height / 4);
            ctx.restore();
            ctx.fillStyle = cols[1];
            ctx.rotate(-crossAngle * Math.PI / 180);
            ctx.fillRect(-width, height * 3 / 8, width*2, height / 4);
            ctx.restore();
            break;
        /*
    case 4:
        //triangle
        break;
    case 5:
        // arrangment of n icons (stars or whatever)
        break;
    */
    }
    return c;
}