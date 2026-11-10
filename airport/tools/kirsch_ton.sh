#!/bin/sh
# Mischt Stimme und Klangebene fuer das Kirsch-Intro zu einer Datei (kirsch/ton.mp3).
# Zeiten in Sekunden entlang der Sprachaufnahme; Lautstaerken als Faktor. Aufruf aus airport/: sh tools/kirsch_ton.sh
T=src/ton
ffmpeg -v error -y \
  -i $T/k-stimme.mp3 -i $T/k-bett.mp3 -i $T/k-flug.mp3 -stream_loop 3 -i $T/k-strasse.mp3 -i $T/k-spray.mp3 -i $T/k-papier.mp3 \
  -filter_complex "
   [0:a]aresample=44100,apad=whole_dur=72[stimme];
   [1:a]aresample=44100,atrim=0:72,asplit=2[b1][b2];
   [b1]volume=0.17,afade=t=in:st=3:d=4,afade=t=out:st=68:d=4[bett];
   [b2]volume=0.34,afade=t=in:st=60.5:d=3,afade=t=out:st=68:d=4[bettende];
   [2:a]aresample=44100,volume=0.26,afade=t=in:d=0.6,afade=t=out:st=4.2:d=1.8[flug];
   [3:a]aresample=44100,atrim=0:70,volume=2.0,afade=t=in:st=2:d=4,afade=t=out:st=62:d=6[strasse];
   [4:a]aresample=44100,volume=0.15,adelay=16900:all=1[spray];
   [5:a]aresample=44100,volume=1.5,adelay=27200:all=1[papier];
   [stimme][bett][bettende][flug][strasse][spray][papier]amix=inputs=7:normalize=0:duration=first,alimiter=limit=0.89:level=0[aus]" \
  -map "[aus]" -ac 1 -b:a 96k kirsch/ton.mp3
