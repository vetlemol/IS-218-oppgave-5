// Oppretter kartet med senterpunkt i Norge
const map = L.map('map').setView([62.5, 10.0], 6);

// Legger til bakgrunnskart
const baseMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// Oppretter layer groups for hver type kraftverk
const vannkraftLayer = L.layerGroup();
const vindkraftLayer = L.layerGroup();
const vindkraftomrLayer = L.layerGroup();
const kraftnettSentralLayer = L.layerGroup();
const kraftnettRegionalLayer = L.layerGroup();

// Lag for trafostasjoner - separat for sentral- og regionalnett
const trafoSentralnettLayer = L.layerGroup();
const trafoRegionalnettLayer = L.layerGroup();

// Legger til layers i kartet som standard
vannkraftLayer.addTo(map);
vindkraftLayer.addTo(map);
vindkraftomrLayer.addTo(map);
kraftnettSentralLayer.addTo(map);
trafoSentralnettLayer.addTo(map);
// Regionalnett lag vil bli synlige ved zoom

// Kobler til Supabase databasen
const supabaseUrl = 'https://nhlmtwcjgaosujzxjoct.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5obG10d2NqZ2Fvc3Vqenhqb2N0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyNzUyNzQsImV4cCI6MjA1NDg1MTI3NH0.AkUp8C7cFEHctqXvuVTsumqsYZ-hSeAIb9D6xRV4zPw';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Tilstand for å holde styr på om lag skal vises eller ikke
const lagTilstand = {
    trafoSentralnett: true,
    trafoRegionalnett: true,
    vannkraft: true,
    vindkraft: true,
    vindkraftomr: true,
    kraftnettSentral: true,
    kraftnettRegional: true
};


// Funksjon for å hente transformatorstasjoner
async function hentTransformatorstasjoner() {
    let allData = [];
    let from = 0;
    const batchSize = 1000; // Antall rader per batch

    try {
        while (true) {
            const { data, error } = await supabase
                .from('trafo')
                .select(`
                    id,
                    nvenettnivaa,
                    spenning_kv,
                    navn,
                    geojson
                `)
                .range(from, from + batchSize - 1); // Hent en batch

            if (error) {
                console.error('Feil ved henting av transformatorstasjoner:', error);
                break;
            }

            if (data.length === 0) {
                // Ingen flere data å hente
                break;
            }

            allData = allData.concat(data); // Legg til data i allData
            from += batchSize; // Flytt til neste batch
        }

        console.log("Alle transformatorstasjoner mottatt", allData.length);

        // Legg til transformatorstasjoner som punkter
        allData.forEach(stasjon => {
            if (!stasjon.geojson) return;

            let geojson;
            try {
                geojson = JSON.parse(stasjon.geojson);
            } catch (e) {
                console.error(`Ugyldig GeoJSON for ID ${stasjon.id}:`, stasjon.geojson);
                return;
            }
            
            const trafotype = stasjon.nvenettnivaa === 1 ? "Sentralnett" : "Regionalnett";

            if (geojson.type === "Point") {
                const lat = geojson.coordinates[1];
                const lng = geojson.coordinates[0];
                const marker = L.circleMarker([lat, lng], {
                    color: "red",
                    radius: stasjon.nvenettnivaa === 1 ? 3 : 2,
                    fillOpacity: 0.8
                }).bindPopup(
                    `<b>${stasjon.navn}</b><br>
                    <b>Trafo</b><br>
                    ${trafotype}<br>
                    <b>Spenning (kV):</b> ${stasjon.spenning_kv} <br>
                    <b>ID:</b> ${stasjon.id}`
                );
             
                if (stasjon.nvenettnivaa === 1){
                    trafoSentralnettLayer.addLayer(marker);
                } else if (stasjon.nvenettnivaa === 2) {
                    trafoRegionalnettLayer.addLayer(marker);
                } else {
                    console.error(`Ukjent nettnivå for ID ${stasjon.id}: ${stasjon.nvenettnivaa}`);
                }
            }
        });
    } catch (error) {
        console.error("Noe gikk galt med transformatorstasjoner:", error);
    }
}




// Funksjon for å hente alle rader fra kraftnettgeojson
async function hentAlleKraftnett() {
    let allData = [];
    let from = 0;
    const batchSize = 1000; // Antall rader per batch

    try {
        while (true) {
            const { data, error } = await supabase
                .from('kraftnettgeojson')
                .select(`
                    id,
                    navn,
                    nettnivaa,
                    nvenettnivaa,
                    spenning_kv,
                    geojson
                `)
                .range(from, from + batchSize - 1); // Hent en batch

            if (error) {
                console.error('Feil ved henting av kraftnett:', error);
                break;
            }

            if (data.length === 0) {
                // Ingen flere data å hente
                break;
            }

            allData = allData.concat(data); // Legg til data i allData
            from += batchSize; // Flytt til neste batch
        }

        console.log("Alle kraftnett mottatt", allData.length);

        // Legg til kraftnett som linjer med forskjellige farger basert på nvenettnivaa
        allData.forEach(linje => {
            if (!linje.geojson) return;

            let geojson;
            try {
                geojson = JSON.parse(linje.geojson);
            } catch (e) {
                console.error(`Ugyldig GeoJSON for ID ${linje.id}:`, linje.geojson);
                return;
            }

            // Velg farge og layer basert på nvenettnivaa
            const farge = linje.nvenettnivaa === 1 ? "red" : "blue";
            const targetLayer = linje.nvenettnivaa === 1 ? kraftnettSentralLayer : kraftnettRegionalLayer;

            L.geoJSON(geojson, {
                style: {
                    color: farge,
                    weight: linje.nvenettnivaa === 1 ? 3 : 2,
                    opacity: 0.8
                }
            }).bindPopup(`<b>Kraftnett</b><br>
                        <b>Navn:</b> ${linje.navn} <br>
                        <b>ID:</b> ${linje.id} <br>
                        <b>Nettnivå:</b> ${linje.nettnivaa} <br>
                        <b>Spenning (kV):</b> ${linje.spenning_kv}`)
            .addTo(targetLayer);
        });
    } catch (error) {
        console.error("Noe gikk galt med henting av kraftnett:", error);
    }
}

// Funksjon for å hente vannkraftverk
async function hentVannkraftverk() {
    try {
        const { data, error } = await supabase
            .from('vannkraftgeojsonny')
            .select(`
                id,
                vannkraftverknavn,
                maksytelse_mw,
                geojson
            `);

        if (error) {
            console.error('Feil ved henting av vannkraftverk:', error);
            return;
        }
        console.log("Vannkraftverk mottatt");

        // Legg til vannkraftverk som blå punkter
        data.forEach(kraftverk => {
            if (!kraftverk.geojson) return;

            let geojson;
            try {
                geojson = JSON.parse(kraftverk.geojson);
            } catch (e) {
                console.error(`Ugyldig GeoJSON for navn ${kraftverk.vannkraftverknavn}:`, kraftverk.geojson);
                return;
            }

            if (geojson.type === "Point") {
                const lat = geojson.coordinates[1];
                const lng = geojson.coordinates[0];

                let radius = 2;
                if (kraftverk.maksytelse_mw >= 1000) {
                    radius = 5;
                }
                else if (kraftverk.maksytelse_mw > 500) {
                    radius = 4;
                }
                else if (kraftverk.maksytelse_mw > 250) {
                    radius = 3;
                }
                L.circleMarker([lat, lng], {
                    color: "blue",
                    radius: radius,
                    fillOpacity: 0.8
                }).bindPopup(`<b>Vannkraftverk</b><br>
                            <b>Vannkraftverk:</b> ${kraftverk.vannkraftverknavn} <br>
                            <b>Id:</b> ${kraftverk.id} <br>
                            <b>Maks ytelse (MW):</b> ${kraftverk.maksytelse_mw}`)
                .addTo(vannkraftLayer);
            }
        });
    } catch (error) {
        console.error("Noe gikk galt med vannkraftverk:", error);
    }
}

// Funksjon for å hente vindkraftverk
async function hentVindkraftverk() {
    try {
        const { data, error } = await supabase
            .from('vindkraftutbygdgeojson')
            .select(`
                id,
                sakstittel,
                effekt_mw,
                geojson
            `);

        if (error) {
            console.error('Feil ved henting av vindkraftverk:', error);
            return;
        }

        console.log("Vindkraftverk mottatt");

        // Legg til vindkraftverk som punkter
        data.forEach(kraftverk => {
            if (!kraftverk.geojson) return;

            let geojson;
            try {
                geojson = JSON.parse(kraftverk.geojson);
            } catch (e) {
                console.error(`Ugyldig GeoJSON for ID ${kraftverk.id}:`, kraftverk.geojson);
                return;
            }

            if (geojson.type === "Point") {
                const lat = geojson.coordinates[1];
                const lng = geojson.coordinates[0];

                let radius = 2;
                if (kraftverk.effekt_mw >= 150) {
                    radius = 6;
                } else if (kraftverk.effekt_mw > 100) {
                    radius = 4;
                } else if (kraftverk.effekt_mw > 50) {
                    radius = 3;
                }

                L.circleMarker([lat, lng], {
                    color: "green",
                    radius: radius,
                    fillOpacity: 0.8
                }).bindPopup(`<b>Vindkraftverk</b><br>
                            <b>Id:</b> ${kraftverk.id} <br>
                            <b>Sakstittel:</b> ${kraftverk.sakstittel} <br>
                            <b>Effekt (MW):</b> ${kraftverk.effekt_mw}`)
                .addTo(vindkraftLayer);
            }
        });
    } catch (error) {
        console.error("Noe gikk galt med vindkraftverk:", error);
    }
}

// Funksjon for å hente vindkraftområder
async function hentVindkraftområder() {
    try {
        const { data, error } = await supabase
            .from('vindkraftomrgeojson')
            .select(`
                id,
                sakstittel,
                effekt_mw,
                effektidrift_mw,
                geojson
            `);
        if (error) {
            console.error('Feil ved henting av vindkraftområder:', error);
            return;
        }
        console.log("Vindkraftområder mottatt");

        // Legg til vindkraftområder som polygoner
        data.forEach(område => {
            if (!område.geojson) return;
            let geojson;
            try {
                geojson = JSON.parse(område.geojson);
            } catch (e) {
                console.error(`Ugyldig GeoJSON for ID ${område.id}:`, område.geojson);
                return;
            }
            L.geoJSON(geojson, {
                style: {
                    color: "orange",
                    weight: 2,
                    fillOpacity: 0.1,
                    fillColor: "orange"
                }
            }).bindPopup(`<b>Vindkraftområde</b><br>
                        <b>Navn:</b> ${område.sakstittel} <br>
                        <b>ID:</b> ${område.id} <br>
                        <b>Effekt (MW):</b> ${område.effekt_mw} <br>
                        <b>Effekt i drift (MW):</b> ${område.effektidrift_mw || 'Ikke oppgitt'}`)
            .addTo(vindkraftomrLayer);
        });
    } catch (error) {
        console.error("Noe gikk galt med vindkraftområder:", error);
    }
}

// Funksjon for å håndtere visning av lag basert på zoom og checkbox
function oppdaterLagSynlighet() {
    const zoomLevel = map.getZoom();
    
    // Fjern alle lag først
    map.removeLayer(trafoSentralnettLayer);
    map.removeLayer(trafoRegionalnettLayer);
    map.removeLayer(vannkraftLayer);
    map.removeLayer(vindkraftLayer);
    map.removeLayer(vindkraftomrLayer);
    map.removeLayer(kraftnettSentralLayer);
    map.removeLayer(kraftnettRegionalLayer);
    
    // Legg til lag basert på brukervalg og zoom
    if (lagTilstand.vindkraftomr) {
        map.addLayer(vindkraftomrLayer);
        // map.bringToBack(vindkraftomrLayer) // Legger vindkraftområder bak andre lag
    }
    
    if (lagTilstand.trafoSentralnett) {
        map.addLayer(trafoSentralnettLayer);
    }
    
    if (lagTilstand.trafoRegionalnett && zoomLevel >= 10) {
        map.addLayer(trafoRegionalnettLayer);
    }
    
    if (lagTilstand.vannkraft) {
        map.addLayer(vannkraftLayer);
    }
    
    if (lagTilstand.vindkraft) {
        map.addLayer(vindkraftLayer);
    }
    
    if (lagTilstand.kraftnettSentral) {
        map.addLayer(kraftnettSentralLayer);
    }
    
    if (lagTilstand.kraftnettRegional && zoomLevel >= 9) {
        map.addLayer(kraftnettRegionalLayer);
    }
}

// Legg til lagkontroll
function leggTilLagKontroll() {
    const lagKontroll = L.control({ position: 'bottomright' });

    lagKontroll.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = '<h4>Lag og Tegnforklaring</h4>';

        const lagElementer = [
            { navn: "Trafostasjoner (Sentralnett)", farge: "red", type: "circle", tilstandsKey: "trafoSentralnett" },
            { navn: "Trafostasjoner (Regionalnett)", farge: "red", type: "circle", tilstandsKey: "trafoRegionalnett" },
            { navn: "Vannkraftverk", farge: "blue", type: "circle", tilstandsKey: "vannkraft" },
            { navn: "Vindkraftverk", farge: "green", type: "circle", tilstandsKey: "vindkraft" },
            { navn: "Vindkraftområder", farge: "orange", type: "line", tilstandsKey: "vindkraftomr" },
            { navn: "Sentralnett", farge: "red", type: "line", tilstandsKey: "kraftnettSentral" },
            { navn: "Regionalnett", farge: "blue", type: "line", tilstandsKey: "kraftnettRegional" }
        ];

        // Alle lag er påslått fra start - elementer som er avhengige av zoom vil bare vises
        // når brukeren zoomer inn til passende nivå
        
        lagElementer.forEach((el, i) => {
            const id = `lag-${i}`;

            const symbol = `<span class="${el.type}" style="background:${el.farge}"></span>`;
            const navn = `<label for="${id}">${el.navn}</label>`;
            const checked = lagTilstand[el.tilstandsKey] ? 'checked' : '';
            const checkbox = `<input type="checkbox" id="${id}" ${checked} style="float:right;" />`;

            const rad = `<div>${symbol} ${navn} ${checkbox}</div>`;
            div.innerHTML += rad;

            // Koble av/på visning
            setTimeout(() => {
                const checkboxElem = document.getElementById(id);
                checkboxElem.addEventListener("change", (e) => {
                    lagTilstand[el.tilstandsKey] = e.target.checked;
                    oppdaterLagSynlighet();
                });
            }, 0);
        });

        // Bytt bakgrunnskart
        const bakgrunnsvalg = `
            <hr>
            <strong>Bakgrunnskart</strong><br>
            <input type="radio" name="basemap" id="osm" checked /> <label for="osm">OpenStreetMap</label><br>
            <input type="radio" name="basemap" id="sat" /> <label for="sat">Satellitt</label>
        `;
        div.innerHTML += bakgrunnsvalg;

        setTimeout(() => {
            document.getElementById("osm").addEventListener("change", () => {
                if (!map.hasLayer(baseMap)) {
                    map.addLayer(baseMap);
                    map.removeLayer(satellite);
                }
            });
            document.getElementById("sat").addEventListener("change", () => {
                if (!map.hasLayer(satellite)) {
                    map.addLayer(satellite);
                    map.removeLayer(baseMap);
                }
            });
        }, 0);

        return div;
    };

    lagKontroll.addTo(map);
}

// Legg til zoom-kontroll håndtering
function konfigurerZoomKontroll() {
    map.on('zoomend', () => {
        const zoomLevel = map.getZoom();
        // console.log("Zoom level:", zoomLevel);
        oppdaterLagSynlighet();
    });
}

// Hent og vis data
async function hentOgVisData() {
    await hentVindkraftområder();
    await hentTransformatorstasjoner();
    await hentVannkraftverk();
    await hentVindkraftverk();
    await hentAlleKraftnett();

    // Oppdater lag synlighet
    oppdaterLagSynlighet();

    // Skjul loader når dataene er lastet
    document.getElementById("loader").style.display = "none";
}


// Initialiser kartet
function initialiserKart() {
    leggTilLagKontroll();
    konfigurerZoomKontroll();
    
    // Oppdater synlighet basert på startinnstillinger
    oppdaterLagSynlighet();

    // Legg til skala-kontroll
    L.control.scale({imperial: false}).addTo(map);
    
    utenlandskabler(); // Legg til utenlandskabler

    // Hent data
    hentOgVisData();
}





function utenlandskabler(){
    const skagerrak = L.polyline([
        [58.1318, 8.0227], // Startpunkt (Sjøkabelterminal Skagerrak 4, Kristiansand)
        [57.00, 9.187] // Endepunkt (Dansk sjøkabelterminal, Jammerbugt kommune)
     ], {
        color: 'black',
        weight: 4,
        dashArray: '5, 10', // Stiplet linje
        opacity: 0.7
     }).addTo(map);
     
     
     // Legg til popup for linjen
     skagerrak.bindPopup(`<b> Utenlandskabler</b><br>
                            <b>Navn:</b> Skagerrak 1-4 <br>
                            <b>Effekt (MW):</b> 1.700 <br>
                            </b> (Plassering og effekt er ikke helt nøyaktig) <br>`
      
     );
    
     const NordLink = L.polyline([
        [53.5518, 9.2051], // Strømrettestasjon ved Wilster
        [58.2219, 6.7193] //(Startpunk)Stolsfjord sør for Flekkefjord
     ], {
        color: 'black',
        weight: 4,
        dashArray: '5, 10', // Stiplet linje
        opacity: 0.7
     }).addTo(map);
     
     
     // Legg til popup for linjen
     NordLink.bindPopup(`<b> Utenlandskabler</b><br>
                            <b>Navn:</b> NordLink <br>
                            <b>Effekt (MW):</b> 1.400 <br>
                            </b> (Plassering og effekt er ikke helt nøyaktig) <br>`
      
     );

     const northSeaLink= L.polyline([
        [59.52878, 6.6542], // Startpunkt (Kvilldal kraftverk, Suldal, Kvilldal)
        [55.126, -1.514] // Endepunkt (Blyth, England)
     ], {
        color: 'black',
        weight: 4,
        dashArray: '5, 10', // Stiplet linje
        opacity: 0.7
     }).addTo(map);
     
     
     // Legg til popup for linjen
     northSeaLink.bindPopup(`<b> Utenlandskabler</b><br>
                            <b>Navn:</b> North Sea Link <br>
                            <b>Effekt (MW):</b> 1.400 <br>
                            </b> (Plassering og effekt er ikke helt nøyaktig) <br>`
      
     );
     

}





// Start applikasjonen
initialiserKart();


 
 