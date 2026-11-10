#!/bin/sh
# Mischt Stimme und Klangebene fuer das Poersch-Intro zu einer Datei (poersch/ton.mp3).
# Zeiten in Sekunden entlang der Sprachaufnahme; Lautstaerken als Faktor. Aufruf aus airport/: sh tools/poersch_ton.sh
T=src/ton
ffmpeg -v error -y \
  -i $T/p-stimme.mp3 -i $T/p-bett.mp3 -i $T/p-anflug.mp3 -i $T/p-broeckeln.mp3 -i $T/p-asche.mp3 -i $T/p-bluehen.mp3 -i $T/p-schlag.mp3 \
  -filter_complex "
   [0:a]aresample=44100,apad=whole_dur=82[stimme];
   [1:a]aresample=44100,atrim=0:82,asplit=2[b1][b2];
   [b1]volume=0.18,afade=t=in:d=2.5,afade=t=out:st=78:d=4[bett];
   [b2]volume=0.26,afade=t=in:st=70.5:d=4,afade=t=out:st=78:d=4[bettende];
   [2:a]aresample=44100,asplit=2[an1][an2];
   [an1]atrim=0:3.3,atempo=0.62,afade=t=out:st=4.9:d=0.4,volume=0.34,adelay=1500:all=1[schwell];
   [an2]atrim=3.38:8,asetpts=PTS-STARTPTS,volume=0.50,adelay=7480:all=1[einrasten];
   [3:a]aresample=44100,volume=0.20,adelay=10200:all=1[broeckeln];
   [4:a]aresample=44100,atempo=0.8,afade=t=out:st=5.5:d=2,volume=0.30,adelay=34400:all=1[asche];
   [5:a]aresample=44100,afade=t=in:d=1.5,volume=0.36,adelay=41500:all=1[bluehen];
   [6:a]aresample=44100,asplit=2[s1][s2];
   [s1]volume=2.6,adelay=29300:all=1[tod];
   [s2]volume=3.2,adelay=72300:all=1[raum];
   [stimme][bett][bettende][schwell][einrasten][broeckeln][asche][bluehen][tod][raum]amix=inputs=10:normalize=0:duration=first,alimiter=limit=0.89:level=0[aus]" \
  -map "[aus]" -ac 1 -b:a 96k poersch/ton.mp3
