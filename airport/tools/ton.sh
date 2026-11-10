#!/bin/sh
# Baut die Tondatei eines Werks: Stimme, dahinter optional leise Musik, die nach dem letzten Satz kurz aufgeht und ausklingt.
# Die Musik (30 Sekunden) wird mit weichen Ueberblendungen aneinandergehaengt, damit sie durchlaeuft.
# Aufruf aus airport/:  sh tools/ton.sh <werk> <gesamtdauer> <ende-der-stimme> [musikdatei] [pegel unter der Stimme] [pegel am Schluss]
#   sh tools/ton.sh poersch 82 72.5                                (nur Stimme)
#   sh tools/ton.sh poersch 82 72.5 src/ton/p-musik.mp3 0.28 0.50  (mit Musik)
W=$1; D=$2; V=$3; M=$4; P=${5:-0.28}; S=${6:-0.50}
K=$(echo "$W" | cut -c1)
if [ -z "$M" ]; then
  ffmpeg -v error -y -i src/ton/$K-stimme.mp3 -af "aresample=44100,apad=whole_dur=$D" -ac 1 -b:a 96k $W/ton.mp3
else
  A=$(echo "$D - 5" | bc)
  ffmpeg -v error -y -i src/ton/$K-stimme.mp3 -i "$M" -filter_complex "
    [1:a]aresample=44100,atrim=0:28,asetpts=PTS-STARTPTS,asplit=4[m1][m2][m3][m4];
    [m1][m2]acrossfade=d=2:c1=tri:c2=tri[m12];[m12][m3]acrossfade=d=2:c1=tri:c2=tri[m123];[m123][m4]acrossfade=d=2:c1=tri:c2=tri[schleife];
    [0:a]aresample=44100,apad=whole_dur=$D[stimme];
    [schleife]atrim=0:$D,afade=t=in:d=3,volume='if(lt(t,$V),$P,min($S,$P+($S-$P)*(t-$V)/3))':eval=frame,afade=t=out:st=$A:d=5[musik];
    [stimme][musik]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89:level=0[aus]" -map "[aus]" -ac 1 -b:a 96k $W/ton.mp3
fi
