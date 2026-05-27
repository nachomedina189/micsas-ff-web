(function () {
  var t = {
    ca: {
      // SHARED
      demana: 'Demana ja! →', contacte: 'Contacte', horaris: 'Horaris',
      hor_dl: 'Dl – Dj:', hor_tancat: 'Tancat', hor_dv: 'Dv – Dg:',
      copyright: '© 2025 micsas.ff · Tots els drets reservats', privacitat: 'Privacitat',
      // INDEX
      idx_demana: 'Demana aquí! →', idx_carta: 'Experiència micsas',
      // CARTA NAV
      nav_historia: 'Història', nav_mob_nos: 'Nosaltres',
      hero_carta: 'La nostra carta →', descobreix: 'Descobreix',
      // BESTSELLERS
      bs_title: 'Els nostres Bestsellers', bs_ingr: 'Ingredients',
      bs_recom: '⭐ La nostra recomanació',
      bs_m_desc: "Tomàquet San Marzano DOP, Fior di latte artesana Il grande Desiderio, Alfàbrega fresca, Formatge Parmigiano (curat 24 mesos) i Oli d'oliva verge extra Valpolicella Slow Food.",
      bs_ca_desc: "Tomàquet datterino caramella, Formatge fumat (Provola), Fior di latte artesana Il grande Desiderio, Alfàbrega fresca en cru, Formatge Caciocavallo i Oli d'oliva verge extra Valpolicella Slow Food.",
      bs_nu_desc: 'Base de crema de xocolata i avellanes Nutella amb topping de festuc de Sicília DOP',
      bs_explora: "Explora la nostra carta i descobreix tot el que t'oferim",
      bs_veure: 'Veure tota la carta →',
      // BANNER
      banner_sub: "Sense pressa, només amor i temps. L'olor de la massa al matí, el so de les motos al vespre, la calor del forn de pedra. Així és Micsas. Així és el nostre barri.",
      // NOSALTRES
      nos_label: 'la meva història', nos_t1: 'Nascuts a Matadepera,', nos_t2: 'fets', nos_t3: 'per compartir.',
      nos_p1: "Micsas neix a Matadepera, d'un grup d'amics obsessionats amb la pizza napolitana de veritat: massa fermentada 72 hores i ingredients escollits un per un. Sense app, sense intermediaris.",
      nos_p2: "Cuinem i entreguem nosaltres mateixos perquè la caixa arribi al teu portal encara calenta. També tenim el servei d'esdeveniments, per tot aquell públic que vol la pizza tradicional napolitana en la seva festa.",
      // SHOP
      shop_desc: "Aviat tindreu novetats sobre la nostra botiga. Estigueu atents al nostre Instagram @micsas.ff!",
      shop_wip: 'En construcció',
      // MENU
      menu_h1: 'Les nostres pizzes', menu_intro: 'Massa fermentada 72h. Ingredients escollits un per un. Cuinem i entreguem nosaltres.',
      menu_sec1: 'Pizzes clàssiques', menu_sec1_sub: 'tradició napolitana',
      menu_moto_d: "Mortadel·la, burrata, pesto de rúcüla, orenga",
      menu_tel_d: "Salami picant, mel de romaní, gorgonzola, nous",
      menu_bes_d: "Botifarra, ceba caramel·litzada, salsa romesco, mozzarella",
      menu_avi_d: "Pernil ibèric, rúcüla, parmesà, tàperes, filet de llimona",
      menu_cre_d: "Mascarpone, bolets de temporada, tòfona negra",
      menu_sec2: 'Les clàssiques', menu_sec2_sub: 'Tradició napolitana',
      menu_marg_d: "Tomàquet San Marzano, mozzarella fior di latte, alfàbrega fresca",
      menu_mar_d: "Tomàquet, all, orenga, oli d'oliva verge extra",
      menu_napo_d: "Tomàquet, mozzarella, anxoves, tàperes, olives negres",
      menu_4f_d: "Mozzarella, gorgonzola, parmesà, provolone, mel",
      menu_cal_d: "Ricotta, mozzarella, pernil dolç, alfàbrega",
      menu_sec3: 'Begudes & Postres', menu_cerv_d: 'Producció local · 33 cl',
      menu_tira_d: 'Fet a la cuina cada dia',
      menu_cta: "T'hem convençut? Ara pots triar i demanar.",
      // EVENTS
      ev_tornar: 'Tornar', ev_title: 'Portem el forn de pizza al teu esdeveniment',
      ev_sub: "Pizzes napolitanes fetes al moment, allà on tu vulguis. Casaments, festes d'empresa, aniversaris o qualsevol celebració que es mereixi una pizza de veritat.",
      ev_inclou: 'Què inclou el servei',
      ev_c1_t: 'Forn de pizza napolitana mòbil',
      ev_c1_d: 'Forn portàtil de pedra refractària que arriba a 450º per a una cocció perfecta.',
      ev_c2_t: 'Pizzaiolo professional',
      ev_c2_d: "El nostre equip expert s'encarrega de tot. Cuinem les pizzes en directe.",
      ev_c3_t: 'Massa artesana i ingredients',
      ev_c3_d: "Massa de 72h de fermentació i ingredients frescos de primera qualitat.",
      ev_c4_t: "Adaptació total a l'espai",
      ev_c4_d: "Muntem la parada on necessitis, només necessitem un petit racó al teu event.",
      ev_tipus: 'Per a qualsevol celebració',
      ev_casa: 'Casaments', ev_empr_html: "Festes<br>d'empresa", ev_aniv: 'Aniversaris',
      ev_priv_html: "Festes<br>privades", ev_equip_html: "Sopars d'equip<br>i tornejos",
      ev_barri_html: "Esdeveniments<br>de barri",
      ev_com: 'Així de fàcil',
      ev_s1_t: 'Ens contactes', ev_s1_d: "Explica'ns la data, lloc i nombre de convidats.",
      ev_s2_t: 'Pressupost a mida', ev_s2_d: "En menys de 24h tens la nostra proposta detallada.",
      ev_s3_t: 'Fem la festa', ev_s3_d: "Anem al teu event, muntem el forn i fem pizzes al moment.",
      ev_galeria: 'Així són els nostres events',
      ev_cta_t: 'Tens un event a la vista?', ev_cta_d: "Contacta'ns i et fem pressupost sense comòs.",
      ev_tel: 'Telèfon de contacte', ev_inst: 'Escriu-nos per Insta',
      ev_f_nom: 'Nom o Empresa', ev_f_data: 'Data event', ev_f_inv: 'Nº Convidats',
      ev_f_det: 'Més detalls', ev_f_nom_ph: 'El teu nom',
      ev_f_det_ph: "Lloc, tipus d'event...", ev_f_btn: 'Demanar pressupost',
    },
    es: {
      // SHARED
      demana: '¡Pide ya! →', contacte: 'Contacto', horaris: 'Horarios',
      hor_dl: 'Lun – Jue:', hor_tancat: 'Cerrado', hor_dv: 'Vie – Dom:',
      copyright: '© 2025 micsas.ff · Todos los derechos reservados', privacitat: 'Privacidad',
      // INDEX
      idx_demana: '¡Pide aquí! →', idx_carta: 'Experiencia micsas',
      // CARTA NAV
      nav_historia: 'Historia', nav_mob_nos: 'Nosotros',
      hero_carta: 'Nuestra carta →', descobreix: 'Descubre',
      // BESTSELLERS
      bs_title: 'Nuestros Bestsellers', bs_ingr: 'Ingredientes',
      bs_recom: '⭐ Nuestra recomendación',
      bs_m_desc: 'Tomate San Marzano DOP, Fior di latte artesana Il grande Desiderio, Albahaca fresca, Queso Parmigiano (curado 24 meses) y Aceite de oliva virgen extra Valpolicella Slow Food.',
      bs_ca_desc: 'Tomate datterino caramella, Queso ahumado (Provola), Fior di latte artesana Il grande Desiderio, Albahaca fresca en crudo, Queso Caciocavallo y Aceite de oliva virgen extra Valpolicella Slow Food.',
      bs_nu_desc: 'Base de crema de chocolate y avellanas Nutella con topping de pistacho de Sicilia DOP',
      bs_explora: "Explora nuestra carta y descubre todo lo que te ofrecemos",
      bs_veure: 'Ver toda la carta →',
      // BANNER
      banner_sub: "Sin prisa, solo amor y tiempo. El olor de la masa por la mañana, el sonido de las motos al atardecer, el calor del horno de piedra. Así es Micsas. Así es nuestro barrio.",
      // NOSALTRES
      nos_label: 'mi historia', nos_t1: 'Nacidos en Matadepera,', nos_t2: 'hechos', nos_t3: 'para compartir.',
      nos_p1: "Micsas nace en Matadepera, de un grupo de amigos obsesionados con la pizza napolitana de verdad: masa fermentada 72 horas e ingredientes elegidos uno a uno. Sin app, sin intermediarios.",
      nos_p2: "Cocinamos y entregamos nosotros mismos para que la caja llegue a tu puerta todavía caliente. También tenemos el servicio de eventos, para todo aquel público que quiera la pizza napolitana tradicional en su fiesta.",
      // SHOP
      shop_desc: "Pronto tendréis novedades sobre nuestra tienda. ¡Estad atentos a nuestro Instagram @micsas.ff!",
      shop_wip: 'En construcción',
      // MENU
      menu_h1: 'Nuestras pizzas', menu_intro: 'Masa fermentada 72h. Ingredientes elegidos uno a uno. Cocinamos y entregamos nosotros.',
      menu_sec1: 'Pizzas especiales', menu_sec1_sub: 'tradición napolitana',
      menu_moto_d: "Mortadela, burrata, pesto de rúcula, orégano",
      menu_tel_d: "Salami picante, miel de romero, gorgonzola, nueces",
      menu_bes_d: "Butifarra, cebolla caramelizada, salsa romesco, mozzarella",
      menu_avi_d: "Jamón ibérico, rúcula, parmesano, alcáparras, toque de limón",
      menu_cre_d: "Mascarpone, setas de temporada, trufa negra",
      menu_sec2: 'Las clásicas', menu_sec2_sub: 'Tradición napolitana',
      menu_marg_d: "Tomate San Marzano, mozzarella fior di latte, albahaca fresca",
      menu_mar_d: "Tomate, ajo, orégano, aceite de oliva virgen extra",
      menu_napo_d: "Tomate, mozzarella, anchoas, alcáparras, aceitunas negras",
      menu_4f_d: "Mozzarella, gorgonzola, parmesano, provolone, miel",
      menu_cal_d: "Ricotta, mozzarella, jamón dulce, albahaca",
      menu_sec3: 'Bebidas & Postres', menu_cerv_d: 'Producción local · 33 cl',
      menu_tira_d: 'Hecho en la cocina cada día',
      menu_cta: "¿Te hemos convencido? Ya puedes elegir y pedir.",
      // EVENTS
      ev_tornar: 'Volver', ev_title: 'Llevamos el horno de pizza a tu evento',
      ev_sub: "Pizzas napolitanas hechas al momento, donde tú quieras. Bodas, fiestas de empresa, aniversarios o cualquier celebración que se merezca una pizza de verdad.",
      ev_inclou: 'Qué incluye el servicio',
      ev_c1_t: 'Horno de pizza napolitana móvil',
      ev_c1_d: 'Horno portátil de piedra refractaria que alcanza 450º para una cocción perfecta.',
      ev_c2_t: 'Pizzaiolo profesional',
      ev_c2_d: "Nuestro equipo experto se encarga de todo. Cocinamos las pizzas en directo.",
      ev_c3_t: 'Masa artesana e ingredientes',
      ev_c3_d: "Masa de 72h de fermentación e ingredientes frescos de primera calidad.",
      ev_c4_t: "Adaptación total al espacio",
      ev_c4_d: "Montamos el puesto donde necesites, solo necesitamos un pequeño rincón en tu evento.",
      ev_tipus: 'Para cualquier celebración',
      ev_casa: 'Bodas', ev_empr_html: "Fiestas<br>de empresa", ev_aniv: 'Aniversarios',
      ev_priv_html: "Fiestas<br>privadas", ev_equip_html: "Cenas de equipo<br>y torneos",
      ev_barri_html: "Eventos<br>de barrio",
      ev_com: 'Así de fácil',
      ev_s1_t: 'Nos contactas', ev_s1_d: "Cuéntanos la fecha, lugar y número de invitados.",
      ev_s2_t: 'Presupuesto a medida', ev_s2_d: "En menos de 24h tienes nuestra propuesta detallada.",
      ev_s3_t: 'Hacemos la fiesta', ev_s3_d: "Vamos a tu evento, montamos el horno y hacemos pizzas al momento.",
      ev_galeria: 'Así son nuestros eventos',
      ev_cta_t: '¿Tienes un evento en mente?', ev_cta_d: "Contáctanos y te hacemos un presupuesto sin compromiso.",
      ev_tel: 'Teléfono de contacto', ev_inst: 'Escríbenos por Insta',
      ev_f_nom: 'Nombre o Empresa', ev_f_data: 'Fecha del evento', ev_f_inv: 'Nº Invitados',
      ev_f_det: 'Más detalles', ev_f_nom_ph: 'Tu nombre',
      ev_f_det_ph: "Lugar, tipo de evento...", ev_f_btn: 'Pedir presupuesto',
    }
  };

  function applyLang(lang) {
    localStorage.setItem('micsas_lang', lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (t[lang] && t[lang][key] !== undefined) el.textContent = t[lang][key];
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (t[lang] && t[lang][key] !== undefined) el.innerHTML = t[lang][key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (t[lang] && t[lang][key] !== undefined) el.placeholder = t[lang][key];
    });

    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      var active = btn.getAttribute('data-lang') === lang;
      btn.style.fontWeight = active ? '700' : '500';
      btn.style.color = active ? '#E23F2E' : '#2A1E16';
    });
  }

  window.applyLang = applyLang;

  document.addEventListener('DOMContentLoaded', function () {
    var lang = localStorage.getItem('micsas_lang') || 'ca';
    applyLang(lang);
  });
})();
