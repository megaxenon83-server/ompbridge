# Sikkerhet

Bruk **Security → Report a vulnerability** i GitHub hvis privat rapportering er aktivert. Kontakt ellers vedlikeholderen privat. Oppgi versjon, berørt komponent og nok detaljer til å undersøke problemet uten å sende nøkler eller samtalefiler.

OMP Bridge kjører med rettighetene til den innloggede Windows-brukeren. Bruk den på et betrodd privat nettverk eller VPN, og hold port 7778 utenfor offentlig internett. Ta vare på QR-koder og konfigurasjonen i `%LOCALAPPDATA%\Nimay\OMPBridge\bridge\config.json`. Android pares med en kortvarig engangskode.

Installasjonsprogrammet oppretter en tilfeldig nøkkel for nye installasjoner. Eksisterende konfigurasjon beholdes ved oppgradering. Modelltilgang konfigureres på PC-en. Publiser aldri bridge-konfigurasjon, API-nøkler eller signeringsnøkler.
