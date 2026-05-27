// ==================== CONFIGURACIÓN DE FIREBASE ====================
const firebaseConfig = {
  apiKey: "AIzaSyAoFFuOKVMKXXrohDGz_SO0HY6lfG6F9k4",
  authDomain: "proyecto-vial-59296.firebaseapp.com",
  databaseURL: "https://proyecto-vial-59296-default-rtdb.firebaseio.com",
  projectId: "proyecto-vial-59296",
  storageBucket: "proyecto-vial-59296.firebasestorage.app",
  messagingSenderId: "22263521330",
  appId: "1:22263521330:web:21f8cc364bcf1b0e9c1c2b",
  measurementId: "G-C6JYR5L9PX"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ==================== VARIABLES GLOBALES ====================
let map;
let userMarker;
let vehicleMarker;
let roadMarkers = [];
let userLocation = null;
let watchID = null;
let dataUpdateInterval;
let alertsList = [];
const MAX_ALERTS = 10;

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    const loadingScreen = document.getElementById('loadingScreen');
    const mainContainer = document.getElementById('mainContainer');
    const enableGPSBtn = document.getElementById('enableGPS');
    
    // Verificar si el navegador soporta geolocalización
    if ("geolocation" in navigator) {
        // Intentar obtener la ubicación actual
        navigator.geolocation.getCurrentPosition(
            (position) => {
                // Usuario aceptó compartir ubicación
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                initializeApp();
                loadingScreen.style.display = 'none';
                mainContainer.style.display = 'flex';
            },
            (error) => {
                // Usuario denegó o hubo error
                console.error("Error de geolocalización:", error);
                enableGPSBtn.style.display = 'block';
                document.querySelector('.spinner').style.display = 'none';
                
                enableGPSBtn.addEventListener('click', () => {
                    // Intentar de nuevo
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            userLocation = {
                                lat: position.coords.latitude,
                                lng: position.coords.longitude
                            };
                            initializeApp();
                            loadingScreen.style.display = 'none';
                            mainContainer.style.display = 'flex';
                        },
                        (err) => {
                            alert('Es necesario activar el GPS para usar esta aplicación. Por favor, permite el acceso a la ubicación en la configuración de tu navegador.');
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0
                        }
                    );
                });
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        alert("Tu navegador no soporta geolocalización. Por favor, usa un navegador moderno como Chrome, Firefox o Safari.");
    }
    
    // Toggle panel lateral
    document.getElementById('togglePanel').addEventListener('click', () => {
        const panel = document.getElementById('sidePanel');
        const icon = document.querySelector('#togglePanel i');
        panel.classList.toggle('collapsed');
        
        if (panel.classList.contains('collapsed')) {
            icon.className = 'fas fa-chevron-left';
        } else {
            icon.className = 'fas fa-chevron-right';
        }
    });
});

// ==================== INICIALIZAR MAPA ====================
function initializeApp() {
    // Crear mapa centrado en la ubicación del usuario
    map = L.map('map').setView([userLocation.lat, userLocation.lng], 16);
    
    // Capa del mapa (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Ícono personalizado para el usuario
    const userIcon = L.divIcon({
        html: '<div style="background-color: #4A90E2; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(74,144,226,0.8);"></div>',
        iconSize: [20, 20],
        className: 'user-marker'
    });
    
    // Marcador del usuario
    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('📍 <b>Tu ubicación actual</b>')
        .openPopup();
    
    // Crear un círculo de precisión
    L.circle([userLocation.lat, userLocation.lng], {
        radius: 20,
        color: '#4A90E2',
        fillColor: '#4A90E2',
        fillOpacity: 0.2
    }).addTo(map);
    
    // Iniciar seguimiento GPS del usuario
    startLocationTracking();
    
    // Escuchar datos en tiempo real de Firebase
    listenToFirebaseData();
    
    // Actualizar datos periódicamente (cada 2 segundos)
    dataUpdateInterval = setInterval(updatePeriodicData, 2000);
    
    // Actualizar estado de conexión
    updateConnectionStatus(true);
    
    console.log('🚀 Aplicación inicializada correctamente');
    console.log('📍 Ubicación:', userLocation);
}

// ==================== SEGUIMIENTO GPS DEL USUARIO ====================
function startLocationTracking() {
    if ("geolocation" in navigator) {
        watchID = navigator.geolocation.watchPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Actualizar marcador del usuario
                userMarker.setLatLng([userLocation.lat, userLocation.lng]);
                
                // Centrar mapa en la ubicación del usuario (suavizado)
                map.panTo([userLocation.lat, userLocation.lng], {
                    animate: true,
                    duration: 0.5
                });
                
                document.getElementById('gpsStatus').innerHTML = 
                    '<i class="fas fa-satellite"></i> GPS: Activo';
            },
            (error) => {
                console.error("Error en seguimiento GPS:", error);
                document.getElementById('gpsStatus').innerHTML = 
                    '<i class="fas fa-satellite"></i> GPS: Error';
            },
            {
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 5000
            }
        );
    }
}

// ==================== ESCUCHAR DATOS DE FIREBASE ====================
function listenToFirebaseData() {
    // Escuchar ubicación actual del vehículo ESP32
    database.ref('ubicacion_actual').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.lat && data.lng) {
            updateVehicleOnMap(data);
        }
    });
    
    // Escuchar datos viales históricos (últimos 100 registros)
    database.ref('datos_viales').limitToLast(100).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            updateRoadConditions(data);
        }
    });
    
    // Escuchar estado de conexión de Firebase
    database.ref('.info/connected').on('value', (snapshot) => {
        updateConnectionStatus(snapshot.val());
    });
    
    console.log('👂 Escuchando datos de Firebase...');
}

// ==================== ACTUALIZAR VEHÍCULO EN EL MAPA ====================
function updateVehicleOnMap(data) {
    if (!vehicleMarker) {
        // Ícono para el vehículo ESP32
        const vehicleIcon = L.divIcon({
            html: '<i class="fas fa-car" style="font-size: 24px; color: #FF5722; filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));"></i>',
            iconSize: [24, 24],
            className: 'vehicle-marker'
        });
        
        vehicleMarker = L.marker([data.lat, data.lng], { icon: vehicleIcon })
            .addTo(map)
            .bindPopup('🚗 <b>Vehículo ESP32</b>');
    } else {
        vehicleMarker.setLatLng([data.lat, data.lng]);
    }
    
    // Actualizar velocidad actual
    if (data.velocidad) {
        document.getElementById('currentSpeed').textContent = Math.round(data.velocidad);
    }
    
    // Actualizar estado de la carretera
    if (data.estado) {
        updateRoadConditionDisplay(data.estado);
    }
    
    // Actualizar popup del vehículo
    if (vehicleMarker.getPopup()) {
        vehicleMarker.setPopupContent(`
            <b>🚗 Vehículo ESP32</b><br>
            Velocidad: ${Math.round(data.velocidad || 0)} km/h<br>
            Estado: ${data.estado || 'Normal'}
        `);
    }
}

// ==================== ACTUALIZAR CONDICIONES DEL CAMINO ====================
function updateRoadConditions(data) {
    // Limpiar marcadores antiguos de la carretera
    roadMarkers.forEach(marker => map.removeLayer(marker));
    roadMarkers = [];
    
    // Procesar cada lectura
    Object.values(data).forEach(reading => {
        if (reading.latitud && reading.longitud) {
            // Solo mostrar marcadores de advertencia
            if (reading.estado_carretera && reading.estado_carretera !== 'normal') {
                const marker = createRoadMarker(reading);
                roadMarkers.push(marker);
            }
            
            // Si es el dato más reciente, actualizar UI
            if (reading.timestamp) {
                updateUI(reading);
            }
        }
    });
    
    console.log(`🛣️ ${roadMarkers.length} alertas viales en el mapa`);
}

function createRoadMarker(reading) {
    const markerColor = getMarkerColor(reading.estado_carretera);
    const markerIcon = getMarkerIcon(reading.estado_carretera);
    
    const customIcon = L.divIcon({
        html: `<div style="
            background: ${markerColor};
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        ">${markerIcon}</div>`,
        iconSize: [30, 30],
        className: 'road-marker'
    });
    
    const marker = L.marker([reading.latitud, reading.longitud], { icon: customIcon })
        .addTo(map)
        .bindPopup(createPopupContent(reading));
    
    return marker;
}

function createPopupContent(reading) {
    const tiempo = reading.timestamp ? new Date(parseInt(reading.timestamp)).toLocaleTimeString() : 'Desconocido';
    const velocidadRec = reading.velocidad_recomendada ? Math.round(reading.velocidad_recomendada) : 'N/A';
    
    return `
        <div style="min-width: 200px;">
            <b>⚠️ Alerta Vial</b><br>
            <hr>
            <b>Estado:</b> ${formatEstado(reading.estado_carretera)}<br>
            <b>Velocidad recomendada:</b> ${velocidadRec} km/h<br>
            <b>Velocidad registrada:</b> ${Math.round(reading.velocidad || 0)} km/h<br>
            <b>Aceleración Z:</b> ${reading.accelZ ? reading.accelZ.toFixed(2) : 'N/A'} g<br>
            <b>Detectado:</b> ${tiempo}<br>
            <small>Lat: ${reading.latitud.toFixed(6)}, Lng: ${reading.longitud.toFixed(6)}</small>
        </div>
    `;
}

// ==================== ACTUALIZAR INTERFAZ DE USUARIO ====================
function updateUI(data) {
    // Estado de la carretera
    if (data.estado_carretera) {
        updateRoadConditionDisplay(data.estado_carretera);
    }
    
    // Velocidad recomendada
    if (data.velocidad_recomendada) {
        document.getElementById('speedRecommendation').innerHTML = 
            `<i class="fas fa-shield-alt"></i> Velocidad recomendada: ${Math.round(data.velocidad_recomendada)} km/h`;
    }
    
    // Datos ambientales
    if (data.temperatura) {
        document.getElementById('temperature').textContent = `${data.temperatura.toFixed(1)}°C`;
    }
    if (data.presion) {
        document.getElementById('pressure').textContent = `${data.presion.toFixed(1)} hPa`;
    }
    if (data.altitud_barometrica || data.altitud_gps) {
        const altitud = data.altitud_barometrica || data.altitud_gps;
        document.getElementById('altitude').textContent = `${altitud.toFixed(0)} m`;
    }
    
    // Agregar alerta si es necesario
    if (data.estado_carretera && data.estado_carretera !== 'normal') {
        addAlert(data);
    }
}

function updateRoadConditionDisplay(estado) {
    const conditionDiv = document.getElementById('roadCondition');
    conditionDiv.className = `condition-display ${estado}`;
    
    const conditionText = document.querySelector('.condition-text');
    const conditionIcon = document.querySelector('.condition-icon i');
    
    switch(estado) {
        case 'normal':
            conditionText.textContent = 'Normal';
            conditionIcon.className = 'fas fa-check-circle';
            break;
        case 'mal_estado':
            conditionText.textContent = 'Precaución';
            conditionIcon.className = 'fas fa-exclamation-circle';
            break;
        case 'bache':
            conditionText.textContent = '¡Bache!';
            conditionIcon.className = 'fas fa-exclamation-triangle';
            break;
        case 'peligro_frenado':
            conditionText.textContent = 'Frenado Brusco';
            conditionIcon.className = 'fas fa-hand-paper';
            break;
        default:
            conditionText.textContent = 'Desconocido';
            conditionIcon.className = 'fas fa-question-circle';
    }
}

// ==================== SISTEMA DE ALERTAS ====================
function addAlert(data) {
    const alertsList = document.getElementById('alertsList');
    const noAlerts = document.querySelector('.no-alerts');
    if (noAlerts) noAlerts.remove();
    
    // Evitar alertas duplicadas en poco tiempo
    const lastAlert = alertsList[alertsList.length - 1];
    if (lastAlert && lastAlert.estado === data.estado_carretera) {
        const timeDiff = Date.now() - lastAlert.timestamp;
        if (timeDiff < 5000) return; // No mostrar la misma alerta en 5 segundos
    }
    
    const alertConfig = getAlertConfig(data.estado_carretera);
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert-item ${data.estado_carretera}`;
    alertDiv.innerHTML = `
        <span class="alert-icon">${alertConfig.icon}</span>
        <div class="alert-content">
            <strong>${alertConfig.title}</strong>
            <p>${alertConfig.message}</p>
            <small>${new Date().toLocaleTimeString()}</small>
        </div>
    `;
    
    alertsList.insertBefore(alertDiv, alertsList.firstChild);
    
    // Almacenar en array
    alertsList.push({
        estado: data.estado_carretera,
        timestamp: Date.now()
    });
    
    // Limitar número de alertas
    if (alertsList.children.length > MAX_ALERTS) {
        alertsList.removeChild(alertsList.lastChild);
    }
}

function getAlertConfig(estado) {
    const configs = {
        'bache': {
            icon: '🕳️',
            title: 'Bache Detectado',
            message: 'Reduzca la velocidad inmediatamente'
        },
        'mal_estado': {
            icon: '🛤️',
            title: 'Carretera en Mal Estado',
            message: 'Conduzca con precaución'
        },
        'peligro_frenado': {
            icon: '🛑',
            title: 'Zona de Frenado Brusco',
            message: 'Mantenga distancia de seguridad'
        }
    };
    
    return configs[estado] || {
        icon: '⚠️',
        title: 'Alerta Vial',
        message: 'Condición irregular detectada'
    };
}

// ==================== UTILIDADES ====================
function updateConnectionStatus(connected) {
    const statusBadge = document.getElementById('connectionStatus');
    if (connected) {
        statusBadge.innerHTML = '<span class="dot" style="background: #4CAF50;"></span><span>Conectado</span>';
    } else {
        statusBadge.innerHTML = '<span class="dot" style="background: #f44336;"></span><span>Desconectado</span>';
    }
}

function updatePeriodicData() {
    if (!userLocation) return;
    
    // Obtener el dato más reciente de Firebase
    database.ref('datos_viales').limitToLast(1).once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const lastReading = Object.values(data)[0];
            if (lastReading) {
                updateUI(lastReading);
            }
        }
    });
}

function getMarkerColor(estado) {
    const colors = {
        'bache': '#f44336',           // Rojo
        'peligro_frenado': '#FF5722', // Naranja oscuro
        'mal_estado': '#FFC107',      // Amarillo
        'normal': '#4CAF50'           // Verde
    };
    return colors[estado] || '#9E9E9E'; // Gris por defecto
}

function getMarkerIcon(estado) {
    const icons = {
        'bache': '🕳️',
        'peligro_frenado': '🛑',
        'mal_estado': '⚠️',
        'normal': '✓'
    };
    return icons[estado] || '•';
}

function formatEstado(estado) {
    const formatos = {
        'normal': '✅ Normal',
        'mal_estado': '⚠️ Mal Estado',
        'bache': '🕳️ Bache',
        'peligro_frenado': '🛑 Frenado Brusco'
    };
    return formatos[estado] || estado;
}

// ==================== LIMPIEZA Y DESCONEXIÓN ====================
window.addEventListener('beforeunload', () => {
    // Limpiar watchers
    if (watchID) {
        navigator.geolocation.clearWatch(watchID);
    }
    
    // Limpiar intervalo
    if (dataUpdateInterval) {
        clearInterval(dataUpdateInterval);
    }
    
    // Desconectar listeners de Firebase
    database.ref('ubicacion_actual').off();
    database.ref('datos_viales').off();
    database.ref('.info/connected').off();
    
    console.log('👋 Aplicación cerrada, recursos liberados');
});

// ==================== MANEJO DE ERRORES ====================
window.addEventListener('error', (event) => {
    console.error('Error en la aplicación:', event.error);
});

// Si el mapa no carga después de 10 segundos, mostrar error
setTimeout(() => {
    if (!map) {
        console.error('Error: El mapa no se pudo cargar');
        alert('Hubo un problema al cargar el mapa. Por favor, recarga la página.');
    }
}, 10000);

console.log('📄 Script cargado y listo');