import {useState} from "react";

import API from "../axios";


export default function AnalystDashboard(){
    const[file,setFile]=useState(null);
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [transactions, setTransactions] = useState([]);
     const [filter, setFilter] = useState("ALL");

}
const handleUpload=async()=>{
    if(!file) return;

    setLoading(true);

}