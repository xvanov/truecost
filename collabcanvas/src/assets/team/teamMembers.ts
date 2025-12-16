// Team member configuration
// To add a new member: Add their image to images/, then add an object below

import kalinImg from "./images/kalin.jpeg";
import yahavImg from "./images/yahav.jpeg";
import ankitImg from "./images/ankit.jpeg";
import kishorImg from "./images/kishor.jpeg";
import atharvaImg from "./images/atharva.jpeg";
import sainathaImg from "./images/sainatha.jpeg";

export interface TeamMember {
  name: string;
  role: string;
  image: string;
  desc?: string;
}

export const teamMembers: TeamMember[] = [
  {
    name: "Kalin Ivanov",
    role: "",
    image: kalinImg,
    desc: "",
  },
  {
    name: "Yahav Corcos",
    role: "",
    image: yahavImg,
    desc: "",
  },
  {
    name: "Ankit Rijal",
    role: "",
    image: ankitImg,
    desc: "",
  },
  {
    name: "Kishor Kashid",
    role: "",
    image: kishorImg,
    desc: "",
  },
  {
    name: "Atharva Sardar",
    role: "",
    image: atharvaImg,
    desc: "",
  },
  {
    name: "Sainatha Yatham",
    role: "",
    image: sainathaImg,
    desc: "",
  },
];
